import { formatDateDDMMYYYY } from './dateTime.ts';
import type { SalarySlipRecord } from './types.ts';

function escapePdfText(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Generates a clean, standards-compliant single-page PDF 1.4 Salary Slip statement
 * formatted with dd-mm-yyyy dates in Asia/Karachi for Sandbox downloads.
 */
export function generateSalarySlipPdf(slip: SalarySlipRecord, companyName: string): Buffer {
  const lines: Array<{ text: string; size: number; x: number; y: number; bold?: boolean }> = [];
  let y = 760;

  const push = (text: string, size = 10, x = 50, bold = false) => {
    lines.push({ text, size, x, y, bold });
  };

  push(companyName.toUpperCase(), 14, 50, true);
  y -= 20;
  push(`SALARY SLIP - ${slip.month_label}`, 12, 50, true);
  y -= 18;
  push(
    `Slip ID: ${slip.name}   |   Status: ${slip.status}   |   Posting Date: ${formatDateDDMMYYYY(slip.posting_date)}`,
    9,
    50,
  );
  y -= 24;

  push(`Employee: ${slip.employee_name} (ID: ${slip.employee})`, 10, 50, true);
  y -= 15;
  push(`Department: ${slip.department}   |   Designation: ${slip.designation}`, 9, 50);
  y -= 15;
  push(
    `Period: ${formatDateDDMMYYYY(slip.start_date)} to ${formatDateDDMMYYYY(slip.end_date)}   |   Payment Days: ${slip.payment_days} / ${slip.total_working_days}`,
    9,
    50,
  );
  y -= 26;

  push('EARNINGS', 11, 50, true);
  y -= 16;
  for (const e of slip.earnings) {
    push(e.salary_component, 10, 58);
    push(`${slip.currency} ${e.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 10, 400);
    y -= 16;
  }

  y -= 12;
  push('DEDUCTIONS', 11, 50, true);
  y -= 16;
  for (const d of slip.deductions) {
    push(d.salary_component, 10, 58);
    push(`${slip.currency} ${d.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 10, 400);
    y -= 16;
  }

  y -= 20;
  push('SUMMARY', 11, 50, true);
  y -= 16;
  push(`Gross Pay:`, 10, 58, true);
  push(`${slip.currency} ${slip.gross_pay.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 10, 400, true);
  y -= 16;
  push(`Total Deductions:`, 10, 58);
  push(`${slip.currency} ${slip.total_deduction.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 10, 400);
  y -= 18;
  push(`NET PAY:`, 12, 58, true);
  push(`${slip.currency} ${slip.net_pay.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 12, 400, true);

  y -= 36;
  push('Generated from ERPNext HRMS Employee Self-Service (Asia/Karachi).', 8, 50);

  const streamParts = ['BT'];
  for (const item of lines) {
    const font = item.bold ? '/F2' : '/F1';
    streamParts.push(`${font} ${item.size} Tf`);
    streamParts.push(`1 0 0 1 ${item.x} ${item.y} Tm`);
    streamParts.push(`(${escapePdfText(item.text)}) Tj`);
  }
  streamParts.push('ET');
  const contentStream = streamParts.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}
