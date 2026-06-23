// Excel serial date utilities (epoch 1899-12-30, Excel leap-year bug included).
export { toSerial } from '../parse-hizmet.mjs';

export function fromSerial(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const d = new Date(epoch + serial * 86400000);
  return {
    day: d.getUTCDate(),
    month: d.getUTCMonth() + 1,
    year: d.getUTCFullYear(),
    toDMY() {
      return `${String(this.day).padStart(2, '0')}.${String(this.month).padStart(2, '0')}.${this.year}`;
    },
  };
}

export function yearOf(serial) {
  const d = fromSerial(serial);
  return d ? d.year : null;
}
