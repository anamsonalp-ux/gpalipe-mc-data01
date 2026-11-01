export default function App({ user }: { user: IdentityUser }) {
  const userName =
    user?.user_metadata?.full_name ||
    user?.email ||
    'Administrator';

  const summaryCards = [
    { label: 'Total wards', value: '24', delta: '+3 this month', tone: 'emerald' },
    { label: 'Active voters', value: '18,420', delta: '+412 this week', tone: 'blue' },
    { label: 'Pending reviews', value: '84', delta: '12 urgent', tone: 'amber' },
    { label: 'Sync status', value: 'Healthy', delta: 'Last sync 12 min ago', tone: 'rose' },
  ];

  const tableRows = [
    { ward: 'Kokoda Ward', population: '2,410', status: 'Updated', risk: 'Low' },
    { ward: 'Mendi Central', population: '3,285', status: 'Review', risk: 'Medium' },
    { ward: 'Awi Ward', population: '1,960', status: 'Synced', risk: 'Low' },
    { ward: 'Lai Valley', population: '2,144', status: 'Pending', risk: 'High' },
  ];

  const recentActivity = [
    'Voter list verification completed for Mendi Central',
    'New ward record approved by the coordinator',
    '3 duplicate entries flagged for review',
    'System backup completed successfully',
  ];

  return (
    <div className="modern-dashboard dashboard-shell min-h-screen bg-slate-100 p-2 sm:p-5 flex flex-col items-center">
      <div className="w-full max-w-[1400px] bg-white rounded-xl shadow-lg border border-slate-200/90 overflow-hidden flex flex-col">
        <header className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-100/90">
                Operations dashboard
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Gibson Palipe • Mendi Central Open
              </h1>
            </div>

            <div className="flex items-center gap-3 self-start lg:self-auto">
              <div className="h-11 w-11 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-lg font-bold">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white/90">Welcome back</p>
                <p className="text-sm text-emerald-100/90">{userName}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="bg-slate-50 p-4 sm:p-6 lg:p-8">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    {item.label}
                  </p>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                      item.tone === 'emerald'
                        ? 'bg-emerald-100 text-emerald-700'
                        : item.tone === 'blue'
                          ? 'bg-sky-100 text-sky-700'
                          : item.tone === 'amber'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    Live
                  </span>
                </div>
                <h3 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">
                  {item.value}
                </h3>
                <p className="mt-2 text-sm text-slate-500">{item.delta}</p>
              </div>
            ))}
          </section>

          <section className="mt-6 flex flex-col gap-4 xl:flex-row">
            <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    Quick actions
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">Ward management</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    Add new ward
                  </button>
                  <button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Export report
                  </button>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {['Overview', 'Ward data', 'Voter status', 'Audit trail'].map((tab, index) => (
                  <button
                    key={tab}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                      index === 0
                        ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full xl:max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Activity
              </p>
              <div className="mt-4 space-y-3">
                {recentActivity.map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <p className="text-sm text-slate-600">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Records
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Ward summary</h2>
              </div>
              <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Updated today
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-emerald-700 text-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.18em]">
                      Ward
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.18em]">
                      Population
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.18em]">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.18em]">
                      Risk
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {tableRows.map((row) => (
                    <tr key={row.ward} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900">{row.ward}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{row.population}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.status === 'Updated'
                              ? 'bg-emerald-100 text-emerald-700'
                              : row.status === 'Review'
                                ? 'bg-amber-100 text-amber-700'
                                : row.status === 'Pending'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-sky-100 text-sky-700'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{row.risk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
