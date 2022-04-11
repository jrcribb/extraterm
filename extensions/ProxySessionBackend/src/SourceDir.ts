/*
 * Copyright 2016 Simon Edwards <simon@simonzone.com>
 *
 * This source code is licensed under the MIT license which is detailed in the LICENSE.txt file.
 */
import {fileURLToPath} from "node:url";

// This is a bit of a hack to find the path to the source code and other resources
// in a way that works during development and also from a packaged version.
export const path = fileURLToPath(import.meta.url).slice(0,-12);
