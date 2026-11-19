import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { getTranslations } from '../i18n/translations';
import { essApi } from '../services/api';
import type { Language, SalarySlipRecord } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateTime';

interface SalarySlipsViewProps {
  lang: Language;
}

export const SalarySlipsView: React.FC<SalarySlipsViewProps> = ({ lang }) => {
  const t = getTranslations(lang);
  const [slips, setSlips] = useState<SalarySlipRecord[]>([]);
  const [selected, setSelected] = useState<SalarySlipRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    essApi
      .getSalarySlips()
      .then((res) => {
        setSlips(res.slips);
        setSelected(res.slips[0] || null);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (slipId: string) => {
    setDownloadingId(slipId);
    try {
      await essApi.downloadSalarySlipPdf(slipId);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section className="lg:col-span-5 rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
          <h2 className="text-lg font-bold text-slate-900">{t.salarySlips}</h2>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : slips.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No submitted salary slips found.</p>
        ) : (
          <ul className="space-y-2.5">
            {slips.map((slip) => {
              const active = selected?.name === slip.name;
              return (
                <li key={slip.name}>
                  <button
                    type="button"
                    onClick={() => setSelected(slip)}
                    className={`w-full text-start rounded-2xl border p-4 transition min-h-[64px] flex items-center justify-between gap-3 ${
                      active
                        ? 'border-emerald-700 bg-emerald-50/60'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">{slip.month_label}</p>
                      <p className="text-xs text-slate-500 font-mono-tabular mt-0.5">
                        {slip.payment_days}/{slip.total_working_days} days · {slip.status}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-sm font-bold text-slate-900 font-mono-tabular">
                        {slip.currency} {slip.net_pay.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-slate-500">{t.netPay}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="lg:col-span-7 rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs text-slate-500 font-mono-tabular">
                  {selected.name} · ID {selected.employee}
                </p>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">{selected.month_label}</h3>
                <p className="text-xs text-slate-500 font-mono-tabular mt-1">
                  {formatDateDDMMYYYY(selected.start_date)} to {formatDateDDMMYYYY(selected.end_date)}
                </p>
              </div>
              <button
                type="button"
                disabled={downloadingId === selected.name}
                onClick={() => void handleDownload(selected.name)}
                className="min-h-[46px] px-4 py-2.5 rounded-xl text-white text-xs font-semibold inline-flex items-center gap-2 transition active:scale-[0.98]"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Download className="w-4 h-4" />
                <span>{downloadingId === selected.name ? 'Preparing PDF...' : t.downloadPdf}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
                <p className="text-[11px] text-slate-500">{t.grossPay}</p>
                <p className="mt-1 text-base font-bold text-slate-900 font-mono-tabular">
                  {selected.currency} {selected.gross_pay.toLocaleString()}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
                <p className="text-[11px] text-slate-500">{t.deductions}</p>
                <p className="mt-1 text-base font-bold text-red-700 font-mono-tabular">
                  {selected.currency} {selected.total_deduction.toLocaleString()}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5">
                <p className="text-[11px] text-emerald-800">{t.netPay}</p>
                <p className="mt-1 text-base font-bold text-emerald-950 font-mono-tabular">
                  {selected.currency} {selected.net_pay.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
              <div>
                <h4 className="text-xs font-bold text-slate-500 mb-2">{t.earnings}</h4>
                <ul className="divide-y divide-slate-100">
                  {selected.earnings.map((e) => (
                    <li key={e.salary_component} className="py-2 flex justify-between text-sm">
                      <span className="text-slate-700">{e.salary_component}</span>
                      <span className="font-mono-tabular font-medium text-slate-900">
                        {selected.currency} {e.amount.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-500 mb-2">{t.deductions}</h4>
                <ul className="divide-y divide-slate-100">
                  {selected.deductions.map((d) => (
                    <li key={d.salary_component} className="py-2 flex justify-between text-sm">
                      <span className="text-slate-700">{d.salary_component}</span>
                      <span className="font-mono-tabular font-medium text-red-700">
                        -{selected.currency} {d.amount.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 py-10 text-center">
            Select a salary slip to view breakdown and download PDF.
          </p>
        )}
      </section>
    </div>
  );
};
