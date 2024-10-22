/*
 * Copyright 2020 Simon Edwards <simon@simonzone.com>
 *
 * This source code is licensed under the MIT license which is detailed in the LICENSE.txt file.
 */

//-------------------------------------------------------------------------
/**
 * Utility class for handling CSS colors
 */
export class Color {

  _red: number;
  _green: number;
  _blue: number;
  _opacity: number; // 0-255
  _hexString: string = null;
  _rgbaString: string = null;

  /**
   * Creates a color object.
   *
   * @param rgbaOrRedOrString CSS color string or RGBA or the red component (0-255).
   * @param green   Green component (0-255).
   * @param blue    Blue compoennt (0-255).
   * @param opacity Opacity or alpha (0-255). 0 is fully transparent, 255 is fully opaque.
   */
  constructor(rgbaOrRedOrString: string | number, green?: number, blue?: number, opacity?: number) {
    if (typeof rgbaOrRedOrString === "string") {
      const stringColor = <string> rgbaOrRedOrString;
      if (stringColor.startsWith("#")) {
        if (stringColor.length === 4) {
          // Parse the 4bit colour values and expand then to 8bit.
          this._red = parseInt(stringColor.slice(1, 2), 16) * 17;
          this._green = parseInt(stringColor.slice(2, 3), 16) * 17;
          this._blue = parseInt(stringColor.slice(3, 4), 16) * 17;
          this._opacity = 255;
        } else if (stringColor.length === 4) {
          // Parse the 4bit colour values and expand then to 8bit.
          this._red = parseInt(stringColor.slice(1, 2), 16) * 17;
          this._green = parseInt(stringColor.slice(2, 3), 16) * 17;
          this._blue = parseInt(stringColor.slice(3, 4), 16) * 17;
          this._opacity = parseInt(stringColor.slice(4, 5), 16) * 17;

        } else if (stringColor.length === 7) {
          this._red = parseInt(stringColor.slice(1, 3), 16);
          this._green = parseInt(stringColor.slice(3, 5), 16);
          this._blue = parseInt(stringColor.slice(5, 7), 16);
          this._opacity = 255;

        } else if (stringColor.length === 9) {
          this._red = parseInt(stringColor.slice(1, 3), 16);
          this._green = parseInt(stringColor.slice(3, 5), 16);
          this._blue = parseInt(stringColor.slice(5, 7), 16);
          this._opacity = parseInt(stringColor.slice(7, 9), 16);
        } else {
          // Malformed hex colour.

        }

      } else {
        // What now?!
      }
    } else {
      if (green === undefined) {
        // `red` is actually 32bit RGBA
        const rgba = <number> rgbaOrRedOrString;
        this._red = (rgba >>> 24) & 0xff;
        this._green = (rgba >>> 16) & 0xff;
        this._blue = (rgba >>> 8) & 0xff;
        this._opacity = rgba & 0xff;

      } else {
        const red = <number> rgbaOrRedOrString;
        this._red = red;
        this._green = green !== undefined ? green : 0;
        this._blue = blue !== undefined ? blue : 0;
        this._opacity = opacity !== undefined ? opacity : 255;
      }
    }
  }
  /**
   * Returns the color as a 6 digit hex string.
   *
   * @return the color as a CSS style hex string.
   */
  toHexString(): string {
    if (this._hexString === null) {
      this._hexString = "#" + to2DigitHex(this._red) + to2DigitHex(this._green) + to2DigitHex(this._blue);
    }
    return this._hexString;
  }

  /**
   * Returns the color as a CSS rgba() value.
   *
   * @return the color as a CSS rgba() value.
   */
  toRGBAString(): string {
    if (this._rgbaString === null) {
      this._rgbaString = "rgba(" + this._red + "," + this._green + "," + this._blue + "," + (this._opacity/255) + ")";
    }
    return this._rgbaString;
  }

  /**
   * Return this color packed into a 32 bit number.
   */
  toRGBA(): number {
    return ((this._red << 24) | (this._green << 16) | (this._blue << 8) | this._opacity) >>> 0;
  }

  /**
   * Returns the color as a CSS string.
   *
   * @return the color as a CSS formatted string.
   */
  toString(): string {
    if (this._opacity === 255) {
      // Use a hex representation.
      return this.toHexString();
    } else {
      return this.toRGBAString();
    }
  }

  /**
   * Creates a new color with the given opacity value.
   *
   * @param  newOpacity A number from 0 to 1.
   * @return the new color.
   */
  opacity(newOpacity: number): Color {
    return new Color(this._red, this._green, this._blue, newOpacity);
  }

  /**
   * Mix two colors together
   *
   * @param otherColor the color to mix with this color
   * @param fraction proportion of each color to mix (0-1). 0 is 100% this
   *        color and 0% of `otherColor`. 1 is 0% this color and 100% of `otherColor`.
   * @return the new resulting color
   */
  mix(otherColor: Color, fraction=0.5): Color {
    const rightFraction = fraction;

    const red = Math.min(255, Math.round(fraction * this._red + rightFraction * otherColor._red));
    const green = Math.min(255, Math.round(fraction * this._green + rightFraction * otherColor._green));
    const blue = Math.min(255, Math.round(fraction * this._blue + rightFraction * otherColor._blue));
    const opacity = Math.min(255, Math.round(fraction* (this._opacity/255) + rightFraction * (otherColor._opacity/255)));
    return new Color(red, green, blue, opacity);
  }
}

/**
 * Converts an 8bit number to a 2 digit hexadecimal string.
 *
 * @param  {number} value An integer in the range 0-255 inclusive.
 * @return {string}       the converted number.
 */
function to2DigitHex(value: number): string {
  const h = value.toString(16);
  return h.length === 1 ? "0" + h : h;
}
