/** Hiz. Dökümü satır sınırları — Excel Mükteza 2026 düzeni. */
export const HIZ_SHEET = 'Hiz. Dökümü';
export const HIZ_DATA_FIRST = 10;
/** Excel'deki son formül satırı; daha uzun döküm bu sınırda kesilir. */
export const HIZ_SHEET_MAX_ROW = 890;
/** Formül zinciri / SUMIF tamponu. */
export const HIZ_ROW_BUFFER = 15;
export const HIZ_INPUT_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];

/**
 * Verilen hizmet satır sayısına göre motorun işleyeceği son satır.
 * Kişiden kişiye döküm uzunluğu değişir; üst sınır HIZ_SHEET_MAX_ROW.
 */
export function hizMaxRowForRowCount(rowCount) {
  if (!rowCount || rowCount <= 0) return HIZ_SHEET_MAX_ROW;
  return Math.min(
    HIZ_SHEET_MAX_ROW,
    Math.max(60, HIZ_DATA_FIRST + rowCount + HIZ_ROW_BUFFER),
  );
}

/** A–P girdilerini temizlerken taranacak son satır (gömülü veri sızıntısını önler). */
export function hizClearThroughRow(rowCount) {
  return hizMaxRowForRowCount(rowCount);
}
