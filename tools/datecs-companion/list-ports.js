// Helper — print every serial device the OS sees so the operator
// knows which COMx (Windows) or /dev/tty.* (mac/Linux) to point
// DATECS_SERIAL_PATH at.

import { SerialPort } from 'serialport';

const ports = await SerialPort.list();
if (ports.length === 0) {
  console.log('Nu s-a găsit niciun port serial conectat.');
  process.exit(0);
}
console.log('Porturi seriale detectate:');
for (const p of ports) {
  const fields = [
    p.path,
    p.manufacturer ? `producător: ${p.manufacturer}` : null,
    p.vendorId ? `VID:${p.vendorId}` : null,
    p.productId ? `PID:${p.productId}` : null,
    p.serialNumber ? `SN:${p.serialNumber}` : null,
  ].filter(Boolean);
  console.log('  -', fields.join(' | '));
}
console.log('\nSetează DATECS_SERIAL_PATH în fișierul .env (sau ca env-var) la calea de mai sus.');
