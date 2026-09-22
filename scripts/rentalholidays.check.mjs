// Autocomprobacion del arreglo de encoding: node scripts/rentalholidays.check.mjs
import assert from "node:assert/strict";
import { corregirTexto } from "../lib/rentalholidays.ts";

assert.equal(corregirTexto("MiÃ©rcoles"), "Miércoles");
assert.equal(corregirTexto("SÃ¡bado"), "Sábado");
assert.equal(corregirTexto("Oropesa del Mar"), "Oropesa del Mar");

console.log("corregirTexto OK");
