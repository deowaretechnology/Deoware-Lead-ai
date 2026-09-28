'use client';

import { useRef, useState } from 'react';
import Papa from 'papaparse';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';

interface Props {
  onImported: () => void;
}

// Upload a CSV of businesses (from any tool / Excel). Headers are matched
// loosely on the server: name, phone, website, address, category, rating,
// reviews, email, instagram, facebook.
export default function CsvImportButton({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState(false);

  const onFile = (file: File) => {
    setMsg('');
    setError(false);
    setBusy(true);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        try {
          const rows = result.data.slice(0, 2000);
          if (!rows.length) throw new Error('No rows found in this file');
          const res = await api.post('/finder/import-csv', { rows, fileName: file.name });
          const s = res.data.data;
          setMsg(
            `Imported ${s.added} new, updated ${s.updated}${s.skipped ? `, skipped ${s.skipped} without a name` : ''}${s.alreadyLeads ? `, ${s.alreadyLeads} already in your pipeline` : ''}.` +
              (result.data.length > 2000 ? ' (Only the first 2,000 rows were imported.)' : '')
          );
          onImported();
        } catch (err) {
          setError(true);
          setMsg(getErrorMessage(err, 'Import failed'));
        } finally {
          setBusy(false);
          if (inputRef.current) inputRef.current.value = '';
        }
      },
      error: (err) => {
        setError(true);
        setMsg(`Could not read the file: ${err.message}`);
        setBusy(false);
      },
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        aria-label="CSV file"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        title="Columns: name, phone, website, address, category, rating, reviews, email, instagram, facebook"
      >
        {busy ? 'Importing…' : 'Import CSV'}
      </button>
      {msg && <p className={`max-w-xs text-right text-xs ${error ? 'text-rose-600' : 'text-emerald-700'}`}>{msg}</p>}
    </div>
  );
}
