
/*
 * Copyright 2024 Simon Edwards <simon@simonzone.com>
 *
 * This source code is licensed under the MIT license which is detailed in the LICENSE.txt file.
 */
import { mat2d } from "gl-matrix";

import { Block, BlockPosture, ExtensionContext, Logger, RowPositionType, Terminal, TerminalBorderWidget, TerminalOutputDetails, TerminalOutputType } from "@extraterm/extraterm-extension-api";
import { QBrush, QColor, QImage, QImageFormat, QMouseEvent, QPainter, QPainterPath, QPaintEvent, QWidget, RenderHint, WidgetEventTypes } from '@nodegui/nodegui';

const terminalToExtensionMap = new WeakMap<Terminal, ScrollMap>();

const SCROLLBAR_WIDTH = 80;
const LEFT_PADDING = 8;
const FRAME_WIDTH = SCROLLBAR_WIDTH - LEFT_PADDING - LEFT_PADDING;

const ZOOM_FACTOR = 16;

const SCROLLMAP_WIDTH_CELLS = 80;
const SCROLLMAP_HEIGHT_ROWS = 256;

let log: Logger = null;
let context: ExtensionContext = null;

interface PixelMap {
  blocks: QImage[];
}

const blockToPixelMap = new WeakMap<Block, PixelMap>();


export function activate(_context: ExtensionContext): any {
  log = _context.logger;
  context = _context;

  context.terminals.onDidCreateTerminal(handleNewTerminal);
  for (const terminal of context.terminals.terminals) {
    handleNewTerminal(terminal);
  }
}

function handleNewTerminal(terminal: Terminal): void {
  const scrollMap = new ScrollMap(terminal);
  terminalToExtensionMap.set(terminal, scrollMap);
}

class ScrollMap {
  #terminal: Terminal = null;
  #borderWidget: TerminalBorderWidget = null;
  #scrollMapWidget: ScrollMapWidget = null;

  constructor(terminal: Terminal) {
    this.#terminal = terminal;

    this.#borderWidget = this.#terminal.createTerminalBorderWidget("scrollmap");

    this.#scrollMapWidget = new ScrollMapWidget(log, terminal);
    this.#borderWidget.contentWidget = this.#scrollMapWidget.getWidget();
    this.#borderWidget.open();
  }
}

class ScrollMapWidget {
  #log: Logger;
  #terminal: Terminal = null;
  #rootWidget: QWidget = null;

  constructor(log: Logger, terminal: Terminal) {
    this.#log = log;
    this.#rootWidget = this.#createWidget();
    this.#terminal = terminal;

    const repaint = () => {
      this.#rootWidget.repaint();
    };
    this.#terminal.onDidScreenChange(repaint);
    this.#terminal.onDidAppendBlock(repaint);
    this.#terminal.onDidAppendScrollbackLines(repaint);
    this.#terminal.viewport.onDidChange(repaint);
  }

  #createWidget(): QWidget {
    const widget = new QWidget();

    widget.setMaximumSize(SCROLLBAR_WIDTH, 16777215);
    widget.setMinimumSize(SCROLLBAR_WIDTH, 32);

    widget.addEventListener(WidgetEventTypes.Paint, (nativeEvent) => {
      this.#handlePaintEvent(new QPaintEvent(nativeEvent));
    });

    const handleMouse = (nativeEvent) => {
      this.#handleMouse(new QMouseEvent(nativeEvent));
    };
    widget.addEventListener(WidgetEventTypes.MouseButtonPress, handleMouse);
    widget.addEventListener(WidgetEventTypes.MouseMove, handleMouse);

    return widget;
  }

  getWidget(): QWidget {
    return this.#rootWidget;
  }

  #getMapOffset(): number {
    const mapScale = 1 / ZOOM_FACTOR;
    const viewport = this.#terminal.viewport;
    const mapOffset = -(mapScale * viewport.position - viewport.position /
      (viewport.contentHeight - viewport.height) * (this.#rootWidget.height()- mapScale * viewport.height));
    return Math.min(0, mapOffset);
  }

  #handlePaintEvent(event: QPaintEvent): void {
    // this.#log.debug(`Paint event: ${event.rect().left()}, ${event.rect().top()}, ` +
    //   `${event.rect().width()}, ${event.rect().height()}`);
    const paintRect = event.rect();
    const palette = this.#terminal.tab.window.style.palette;

    const painter = new QPainter(this.#rootWidget);
    painter.fillRectF(paintRect.left(), paintRect.top(), paintRect.width(), paintRect.height(),
      new QColor(palette.background));

    const mapScale = 1 / ZOOM_FACTOR;
    const viewport = this.#terminal.viewport;

    const runningColor = new QColor(palette.running);
    const runningBrush = new QBrush(runningColor);
    const successColor = new QColor(palette.success);
    const successBrush = new QBrush(successColor);
    const neutralColor = new QColor(palette.neutral);
    const neutralBrush = new QBrush(neutralColor);
    const failColor = new QColor(palette.failure);
    const failBrush = new QBrush(failColor);

    painter.setRenderHint(RenderHint.Antialiasing);

    const mapOffset = this.#getMapOffset();

    for (const block of this.#terminal.blocks) {
      const y = block.geometry.positionTop * mapScale + mapOffset;
      const h = block.geometry.height * mapScale;

      const path = new QPainterPath();

      let color = neutralColor;
      let brush = neutralBrush;
      switch (block.metadata.posture) {
        case BlockPosture.RUNNING:
          color = runningColor;
          brush = runningBrush;
          break;

        case BlockPosture.SUCCESS:
          color = successColor;
          brush = successBrush;
          break;

        case BlockPosture.FAILURE:
          color = failColor;
          brush = failBrush;
          break;

        default:
          break;
      }

      // painter.fillRectF(LEFT_PADDING, y, FRAME_WIDTH, h, color);
      painter.setPen(color);
      // painter.drawRoundedRectF(LEFT_PADDING, y, FRAME_WIDTH, h, 4, 4);

      path.addRoundedRect(LEFT_PADDING, y, FRAME_WIDTH, h, 4, 4);
      painter.fillPath(path, brush);


      if (block.type === TerminalOutputType) {

        let pixelMap = blockToPixelMap.get(block);
        if (pixelMap == null) {
          pixelMap = this.#buildPixelMap(block);
          // blockToPixelMap.set(block, pixelMap);
        }

        const terminalDetails = <TerminalOutputDetails> block.details;
        const scrollbackHeight = terminalDetails.scrollback.height;
        let blockY = 0;
        for (const qImage of pixelMap.blocks) {
          terminalDetails.rowHeight * SCROLLMAP_HEIGHT_ROWS;

          painter.save();

          const matrix = mat2d.create();
          mat2d.translate(matrix, matrix, [LEFT_PADDING, y + blockY]);
          mat2d.scale(matrix, matrix, [1, terminalDetails.rowHeight / ZOOM_FACTOR]);
          painter.setTransform(matrix);

          const blockHeight = Math.min(SCROLLMAP_HEIGHT_ROWS, scrollbackHeight - blockY);
          // const blockHeight = SCROLLMAP_HEIGHT_ROWS;
          painter.drawImage(0, 0, qImage, 0, 0, SCROLLMAP_WIDTH_CELLS, blockHeight);

          painter.restore();

          blockY += terminalDetails.rowHeight * SCROLLMAP_HEIGHT_ROWS / ZOOM_FACTOR;
        }
      }
    }

    // Draw the viewport.
    painter.setPen(new QColor(palette.text));
    painter.drawRectF(paintRect.left(), viewport.position * mapScale + mapOffset,
      paintRect.width(), viewport.height * mapScale);

    painter.end();
  }

  #handleMouse(event: QMouseEvent): void {
    this.#terminal.viewport.position = (event.y() - this.#getMapOffset()) * ZOOM_FACTOR - (this.#terminal.viewport.height / 2);
  }

  #buildPixelMap(block: Block): PixelMap {
    log.debug(`Building pixel map for block ${block.metadata.title}`);
    const pixelMap = {
      blocks: []
    };

    if (block.type === TerminalOutputType) {
      const terminalDetails = <TerminalOutputDetails> block.details;
      const scrollback = terminalDetails.scrollback;

      const height = scrollback.height;

      scrollback.width;
      const buffer = Buffer.alloc(4 * SCROLLMAP_WIDTH_CELLS * SCROLLMAP_HEIGHT_ROWS);

      let bufferOffset = 0;
      let y = 0;
      while (y < height) {
        buffer.fill(0);
        const blockHeight = Math.min(SCROLLMAP_HEIGHT_ROWS, height - y);
        for (let i=0; i<blockHeight; i++, y++) {
          bufferOffset = i * SCROLLMAP_WIDTH_CELLS * 4;

          const row = scrollback.getBaseRow(y);
          const codePoints = row.getRowCodePoints();
          const maxX = Math.min(SCROLLMAP_WIDTH_CELLS, codePoints.length);
          for (let x=0; x<maxX; x++) {
            const codePoint = codePoints[x];
            const value = codePoint === 32 ? 0 : 255;
            // const fg = row.getFgRGBA(x);
            // const bg = row.getBgRGBA(x);

            // const fgColor = palette.getColor(fg);
            // const bgColor = palette.getColor(bg);

            // const fgColorRgb = fgColor.getRgb();
            // const bgColorRgb = bgColor.getRgb();

            // const offset = (y * SCROLLMAP_WIDTH_CELLS + x) * 4;

            // buffer[offset] = fgColorRgb.r;
            // buffer[offset+1] = fgColorRgb.g;
            // buffer[offset+2] = fgColorRgb.b;
            // buffer[offset+3] = 255;

            buffer[bufferOffset] = value;
            bufferOffset++;
            buffer[bufferOffset] = value;
            bufferOffset++;
            buffer[bufferOffset] = value;
            bufferOffset++;
            buffer[bufferOffset] = value;
            bufferOffset++;
          }
        }

        const qImage = QImage.fromBuffer(buffer, SCROLLMAP_WIDTH_CELLS, SCROLLMAP_HEIGHT_ROWS, QImageFormat.ARGB32);
        pixelMap.blocks.push(qImage);
      }
    }

    return pixelMap;
  }
}
