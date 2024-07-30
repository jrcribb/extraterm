/*
 * Copyright 2022 Simon Edwards <simon@simonzone.com>
 *
 * This source code is licensed under the MIT license which is detailed in the LICENSE.txt file.
 */
import { Event, EventEmitter } from "extraterm-event-emitter";
import { Logger, log, getLogger } from "extraterm-logging";
import { QAbstractTableModel, Direction, QWidget, QVariant, QKeyEvent, QModelIndex, ItemDataRole, QTableView,
  QAbstractItemViewSelectionBehavior, SelectionMode, QLineEdit, Key, SelectionFlag, FocusReason, AlignmentFlag, QFont, QColor, QRect, QBoxLayout, QSizePolicyPolicy
} from "@nodegui/nodegui";
import { stringToCodePointArray, hasEmojiPresentation } from "extraterm-unicode-utilities";
import { rankList, surround } from "extraterm-fuzzy-rank";
import { ColorSlot, CommandChar, FontSlot, TurboTextDelegate } from "nodegui-plugin-rich-text-delegate";
import { BoxLayout, TableView, Widget, LineEdit } from "qt-construct";
import { UiStyle } from "./UiStyle.js";
import { TWEMOJI_FAMILY } from "../TwemojiConstants.js";


export enum FieldType {
  TEXT,
  SECONDARY_TEXT,
  SECONDARY_TEXT_RIGHT,
  ICON_NAME
}

export interface Entry {
  id: string;
  searchText: string;

  fields: string[];
}


const SELECTION_START_COLOR_SLOT = ColorSlot.n0;

const SELECTION_START_MARKER = `${SELECTION_START_COLOR_SLOT}${CommandChar.BoldOn}`;
const SELECTION_END_MARKER = `${ColorSlot.default}${FontSlot.default}`;


export class ListPicker {
  private _log: Logger = null;
  #uiStyle: UiStyle = null;
  #widget: QWidget = null;
  #lineEdit: QLineEdit = null;
  #tableView: QTableView = null;
  #contentModel: ContentModel = null;
  #fieldTypes: FieldType[] = [];
  #mainLayout: QBoxLayout= null;
  #isReverse = false;

  #onSelectedEventEmitter = new EventEmitter<string>();
  onSelected: Event<string> = null;

  #onContentAreaChangedEventEmitter = new EventEmitter<void>();
  onContentAreaChanged: Event<void> = null;

  constructor(uiStyle: UiStyle) {
    this._log = getLogger("ListPicker", this);
    this.#uiStyle = uiStyle;
    this.onSelected = this.#onSelectedEventEmitter.event;
    this.onContentAreaChanged = this.#onContentAreaChangedEventEmitter.event;
    this.#createWidget();
  }

  setEntries(fieldTypes: FieldType[], entries: Entry[]): void {
    this.#fieldTypes.forEach( (_, index) => {
      this.#tableView.setItemDelegateForColumn(index, null);
    });
    this.#fieldTypes = fieldTypes;
    this.#fieldTypes.forEach( (fieldType, index) => {
      switch (fieldType) {
        case FieldType.TEXT:
        case FieldType.SECONDARY_TEXT:
          this.#tableView.setItemDelegateForColumn(index, this.#createRichTextDelegate());
          break;
        // case FieldType.SECONDARY_TEXT_RIGHT:
        // TurboTextDelegate doesn't handle right align well yet.
        default:
      }
    });

    this.#contentModel.setEntries(fieldTypes, entries);
    this.#handleTextEdited(this.#lineEdit.text());
    this.#tableView.resizeColumnsToContents();
  }

  #createWidget(): void {
    this.#contentModel = new ContentModel(this.#uiStyle);
    this.#widget = Widget({
      layout: this.#mainLayout = BoxLayout({
        direction: Direction.TopToBottom,
        contentsMargins: [0, 0, 0, 0],
        children: [
          this.#lineEdit = LineEdit({
            onTextEdited: (newText: string) => {
              this.#handleTextEdited(newText);
            },
            onKeyPress: (nativeEvent) => {
              this.#handleKeyPress(new QKeyEvent(nativeEvent));
            },
          }),
          this.#tableView = TableView({
            cssClass: ["list-picker"],
            model: this.#contentModel,
            showGrid: false,
            selectionBehavior: QAbstractItemViewSelectionBehavior.SelectRows,
            selectionMode: SelectionMode.SingleSelection,
            cornerButtonEnabled: false,
            minimumHeight: 0,
            sizePolicy: {
              horizontal: QSizePolicyPolicy.Expanding,
              vertical: QSizePolicyPolicy.Expanding
            },
            onClicked: (nativeElement) => {
              this.#handleClicked(new QModelIndex(nativeElement));
            }
          })
        ]
      })
    });

    const horizontalHeader = this.#tableView.horizontalHeader();
    horizontalHeader.hide();
    horizontalHeader.setStretchLastSection(true);
    const verticalHeader = this.#tableView.verticalHeader();
    verticalHeader.hide();

    this.#tableView.selectionModel().select(this.#contentModel.createIndex(0, 0),
      SelectionFlag.ClearAndSelect | SelectionFlag.Rows);
  }

  getWidget(): QWidget {
    return this.#widget;
  }

  focus(): void {
    this.#lineEdit.setFocus(FocusReason.PopupFocusReason);
  }

  setText(text: string): void {
    this.#lineEdit.setText(text);
    this.#handleTextEdited(text);
  }

  #handleTextEdited(newText: string): void {
    this.#contentModel.setSearch(newText);
    this.#selectDefaultItem();
    this.#onContentAreaChangedEventEmitter.fire();
  }

  #selectDefaultItem(): void {
    if (this.#contentModel.rowCount() === 0) {
      return;
    }
    const index = this.#contentModel.createIndex(this.#isReverse ? (this.#contentModel.rowCount() -1) : 0, 0);
    this.#tableView.selectionModel().select(index, SelectionFlag.ClearAndSelect | SelectionFlag.Rows);
    this.#tableView.scrollTo(index);
  }

  setListAreaFixedHeight(height: number): void {
    this.#tableView.setFixedHeight(height);
    this.#widget.adjustSize();
  }

  clearListAreaFixedHeight(): void {
    this.#tableView.setMinimumHeight(0);
    this.#tableView.setMaximumHeight(16777215);
    this.#widget.adjustSize();
  }

  setReverse(reverse: boolean): void {
    this.#isReverse = reverse;
    this.#mainLayout.setDirection(reverse ? Direction.BottomToTop : Direction.TopToBottom);
    this.#contentModel.setReverse(reverse);
    this.#selectDefaultItem();
  }

  getContentsHeight(): number {
    const rowCount = this.#contentModel.rowCount();
    if (rowCount === 0) {
      return 0;
    }
    return rowCount * this.#tableView.rowHeight(0);
  }

  #handleClicked(index: QModelIndex): void {
    this.#onSelectedEventEmitter.fire(this.#contentModel.idByRow(index.row()));
  }

  #handleKeyPress(event: QKeyEvent): void {
    const key = event.key();
    if ( ! [Key.Key_Down, Key.Key_Up, Key.Key_PageUp, Key.Key_PageDown, Key.Key_Tab, Key.Key_Enter, Key.Key_Return].includes(key)) {
      return;
    }

    if (key === Key.Key_Tab) {
      // Block the tab key
      event.accept();
      this.#lineEdit.setEventProcessed(true);
      return;
    }

    if (this.#contentModel.rowCount() === 0) {
      return;
    }

    if (key === Key.Key_Enter || key === Key.Key_Return) {
      event.accept();
      this.#lineEdit.setEventProcessed(true);
      this.#handleEnterPressed();
      return;
    }

    const selectionModel = this.#tableView.selectionModel();
    const rowIndexes = selectionModel.selectedRows();
    let selectedRowIndex = rowIndexes[0].row();

    if (key === Key.Key_Down) {
      selectedRowIndex++;
    } else if (key === Key.Key_Up) {
      selectedRowIndex--;
    } else if (key === Key.Key_PageUp || key === Key.Key_PageDown) {
      const rowsPerViewport = Math.floor(this.#tableView.height() / this.#tableView.rowHeight(0));
      selectedRowIndex += (key === Key.Key_PageUp ? -1 : 1) * rowsPerViewport;
    } else {
      return;
    }

    selectedRowIndex = Math.max(0, selectedRowIndex);
    selectedRowIndex = Math.min(selectedRowIndex, this.#contentModel.rowCount()-1);
    const newIndex = this.#contentModel.createIndex(selectedRowIndex, 0);
    selectionModel.select(newIndex, SelectionFlag.ClearAndSelect | SelectionFlag.Rows);
    this.#tableView.scrollTo(newIndex);

    event.accept();
    this.#lineEdit.setEventProcessed(true);
  }

  #handleEnterPressed(): void {
    const selectionModel = this.#tableView.selectionModel();
    const rowIndexes = selectionModel.selectedRows();
    const selectedRowIndex = rowIndexes[0].row();
    this.#onSelectedEventEmitter.fire(this.#contentModel.idByRow(selectedRowIndex));
  }

  #createRichTextDelegate(): TurboTextDelegate {
    const delegate = new TurboTextDelegate();
    delegate.setFont(FontSlot.n0, new QFont(TWEMOJI_FAMILY));
    delegate.setColor(SELECTION_START_COLOR_SLOT,
      new QColor(this.#uiStyle.getTextMatchColor()),
      new QColor(this.#uiStyle.getTextMatchSelectedColor()));
    return delegate;
  }
}


interface EntryMetadata {
  entry: Entry;

  text: string;
  markedupText: string;
  score: number;
  score2: number;
  score3: number;
}


function cmpScore(a: EntryMetadata, b: EntryMetadata): number {
  if (a.score === b.score) {
    if (a.score2 === b.score2) {
      if (a.score3 === b.score3) {
        return 0;
      }
      return a.score3 < b.score3 ? -1 : 1;
    }
    return a.score2 < b.score2 ? -1 : 1;
  }
  // Note: Higher scores should be shown first.
  return a.score < b.score ? -1 : 1;
}

function reverseCmpScore(a: EntryMetadata, b: EntryMetadata): number {
  return cmpScore(b, a);
}

class ContentModel extends QAbstractTableModel {
  private _log: Logger = null;
  #uiStyle: UiStyle = null;
  #allEntries: EntryMetadata[] = [];
  #fieldTypes: FieldType[] = [];
  #visibleEntries: EntryMetadata[] = [];
  #searchText: string = "";
  #isReverse = false;

  constructor(uiStyle: UiStyle) {
    super();
    this._log = getLogger("ContentModel", this);
    this.#uiStyle = uiStyle;
  }

  setSearch(searchText: string): void {
    this.#searchText = searchText;
    this.#updateVisibleEntries();
  }

  setReverse(reverse: boolean): void {
    this.#isReverse = reverse;
    this.#updateVisibleEntries();
  }

  #updateVisibleEntries(): void {
    this.beginResetModel();
    this.#visibleEntries = this.#filterEntries(this.#allEntries, this.#searchText);
    this.endResetModel();
  }

  #filterEntries(entries: EntryMetadata[], searchText: string): EntryMetadata[] {
    if (searchText.trim() === "") {
      let i = 0;
      for (const entry of entries) {
        entry.score = i;
        entry.markedupText = this.#encodeEmoji(entry.text);
        i++;
      }

      if ( ! this.#isReverse) {
        return [...entries];
      } else {
        return [...entries].reverse();
      }
    } else {

      const candidates = entries.map(e => e.text);
      const results = rankList(searchText, candidates);
      for (const result of results) {
        const entry = entries[result.index];
        entry.score = result.score;
        entry.score2 = result.score2;
        entry.score3 = result.score3;
        const ranges = result.matchRanges;
        entry.markedupText = this.#encodeEmoji(surround(entry.text,
          {
            ranges,
            prefix: SELECTION_START_MARKER,
            suffix: SELECTION_END_MARKER
          }
        ));
      }

      const resultEntries = [...entries];
      resultEntries.sort(this.#isReverse ? reverseCmpScore : cmpScore);

      return resultEntries;
    }
  }

  setEntries(fieldTypes: FieldType[], entries: Entry[]): void {
    if (entries.length === 0) {
      this.#allEntries = [];
      return;
    }

    const textFieldIndex = fieldTypes.indexOf(FieldType.TEXT);
    if (textFieldIndex === -1) {
      this._log.warn("Argument `fieldTypes` to `setEntries()` must contain a `FieldType.TEXT` value");
      return;
    }

    this.#fieldTypes = fieldTypes;
    this.#allEntries = entries.map(entry => ({
      entry: entry,
      text: entry.fields[textFieldIndex],
      markedupText: this.#encodeEmoji(entry.fields[textFieldIndex]),
      score: 0,
      score2: 0,
      score3: 0,
    }));
    this.#updateVisibleEntries();
  }

  rowCount(parent = new QModelIndex()): number {
    return this.#visibleEntries.length;
  }

  columnCount(parent = new QModelIndex()): number {
    return this.#fieldTypes.length;
  }

  data(index: QModelIndex, role = ItemDataRole.DisplayRole): QVariant {
    if (role === ItemDataRole.DisplayRole) {
      const column = index.column();
      switch (this.#fieldTypes[column]) {
        case FieldType.TEXT:
          return new QVariant(this.#visibleEntries[index.row()].markedupText);
        case FieldType.SECONDARY_TEXT:
        case FieldType.SECONDARY_TEXT_RIGHT:
          return new QVariant(this.#visibleEntries[index.row()].entry.fields[column]);
      }
    }
    if (role === ItemDataRole.TextAlignmentRole) {
      if (this.#fieldTypes[index.column()] === FieldType.SECONDARY_TEXT_RIGHT) {
        return new QVariant(AlignmentFlag.AlignRight | AlignmentFlag.AlignVCenter);
      }
    }
    if (role === ItemDataRole.DecorationRole) {
      if (this.#fieldTypes[index.column()] === FieldType.ICON_NAME) {
        const column = index.column();
        const iconName = this.#visibleEntries[index.row()].entry.fields[column];
        if (iconName != null && iconName !== "") {
          const icon = this.#uiStyle.getCommandPaletteIcon(iconName);
          if (icon != null) {
            return new QVariant(icon.native);
          }
        }
      }
    }
    return new QVariant();
  }

  idByRow(row: number): string {
    return this.#visibleEntries[row].entry.id;
  }

  #encodeEmoji(text: string): string {
    const codePoints = stringToCodePointArray(text);
    let result = "";
    for (let i=0; i < codePoints.length; i++) {
      const codePoint = codePoints[i];
      if (hasEmojiPresentation(codePoint)) {
        result += `${FontSlot.n0}${String.fromCodePoint(codePoint)}${FontSlot.default}`;
      } else {
        result += String.fromCodePoint(codePoint);
      }
    }
    return result;
  }
}
