/*
 * Copyright 2017-2022 Simon Edwards <simon@simonzone.com>
 *
 * This source code is licensed under the MIT license which is detailed in the LICENSE.txt file.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { BulkFileMetadata } from '@extraterm/extraterm-extension-api';
import { getLogger, Logger } from "extraterm-logging";

import { BulkFile } from "./BulkFile.js";


export type BulkFileIdentifier = string;

export type BufferSizeEvent = {identifier: BulkFileIdentifier, totalBufferSize: number, availableDelta: number};
export type CloseEvent = {identifier: BulkFileIdentifier, success: boolean};


/**
 * Responsible for the temporary storage of large files and serving them via a pseudo web protocol.
 */
export class BulkFileStorage {
  private _log: Logger;

  #storageMap = new Map<BulkFileIdentifier, BulkFile>();
  #storageDirectory: string;
  #tempDirectory: string = null;

  constructor(tempDirectory: string) {
    this._log = getLogger("BulkFileStorage", this);
    this.#tempDirectory = tempDirectory;
    this.#storageDirectory = this.#createStorageDirectory(this.#tempDirectory);
  }

  /**
   * Create a tmp directory for storing the bulk files.
   *
   * This tries to make the directory in a secure manner because often times
   * the location is in a shared directory like /tmp which may be vulnerable
   * to symlink style attacks.
   */
  #createStorageDirectory(tempDirectory: string): string {
    const identifier = "extraterm-tmp-storage-" + crypto.randomBytes(16).toString('hex');
    const fullPath = path.join(tempDirectory, identifier);
    try {
      fs.mkdirSync(fullPath, 0o700);
    } catch(e) {
      this._log.warn(`Unable to create temp directory ${fullPath}`, e);
      throw new Error(`Unable to create temp directory ${fullPath}. ${e}`);
    }
    return fullPath;
  }

  #checkAndSetupStorageDirectory(): boolean {
    try {
      fs.accessSync(this.#storageDirectory, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch (err) {
      this._log.warn(`Bulk file storage directory ${this.#storageDirectory} is no longer accessible!`, err);
    }

    try {
      this.#storageDirectory = this.#createStorageDirectory(this.#tempDirectory);
      return true;
    } catch (err) {
      this._log.warn(`Attempt to create new bulk file storage directory at ${this.#storageDirectory} failed!`, err);
      return false;
    }
  }

  dispose(): void {
    for (const identifier of this.#storageMap.keys()) {
      this.#deleteBulkFile(identifier);
    }

    try {
      fs.rmdirSync(this.#storageDirectory);
    } catch (e) {
      this._log.warn(`Unable to delete directory ${this.#storageDirectory}`, e);
    }
  }

  createBulkFile(metadata: BulkFileMetadata): BulkFile {
    const onDiskFileIdentifier = crypto.randomBytes(16).toString('hex');

    if ( ! this.#checkAndSetupStorageDirectory()) {
      this._log.warn("Unable to create bulk file.");
      return null;
    }

    try {
      const fullPath = path.join(this.#storageDirectory, onDiskFileIdentifier);
      const bulkFile = new BulkFile(metadata, fullPath);
      bulkFile.ref();
      const internalFileIdentifier = crypto.randomBytes(16).toString('hex');

      this.#storageMap.set(internalFileIdentifier, bulkFile);

      return bulkFile;
    } catch(e) {
      this._log.warn("Unable to create bulk file on disk.", e);
      return null;
    }
  }

  ref(identifier: BulkFileIdentifier): void {
    if ( ! this.#storageMap.has(identifier)) {
      this._log.warn("Invalid BulkFileIdentifier received: ", identifier);
      return;
    }
    this.#storageMap.get(identifier).ref();
  }

  deref(identifier: BulkFileIdentifier): void {
    if ( ! this.#storageMap.has(identifier)) {
      this._log.warn("Invalid BulkFileIdentifier received: ", identifier);
      return;
    }
    this.#storageMap.get(identifier).deref();
    this.#deleteBulkFile(identifier);
  }

  #deleteBulkFile(identifier: BulkFileIdentifier): void {
    const bulkFile = this.#storageMap.get(identifier);
    try {
      fs.unlinkSync(bulkFile.getFilePath());
    } catch(e) {
      this._log.warn(`Unable to delete file ${bulkFile.getFilePath()}`, e);
    }
    this.#storageMap.delete(identifier);
  }

  getBulkFileByIdentifier(identifier: BulkFileIdentifier): BulkFile {
    if ( ! this.#storageMap.has(identifier)) {
      return null;
    }
    return this.#storageMap.get(identifier);
  }
}
