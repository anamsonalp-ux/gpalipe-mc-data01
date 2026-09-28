export function WardStatisticsModal({
  isOpen, onClose, voters, wards, onSelectWardFilter,
  supabaseWardStats, onEditWard, onOpenWardCamera,
}: WardStatisticsModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"voters" | "supporters" | "percentage" | "name">("voters");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [wardPhotos, setWardPhotos] = useState<Record<string, string>>({});
  const [editingWardProfile, setEditingWardProfile] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const map: Record<string, string> = {};
      for (const w of wards) {
        const p = await getWardPhoto(w);
        if (p) map[w] = p;
      }
      if (!cancelled) setWardPhotos(map);
    })();
    return () => { cancelled = true; };
  }, [isOpen, wards]);

  const wardStatisticsList: WardStatistic[] = useMemo(() => {
    if (supabaseWardStats && supabaseWardStats.length > 0) {
      return supabaseWardStats.map((row: any) => ({
        ward: row.ward || "Unassigned",
        display_name: formatWardDisplay(row.ward || "Unassigned"),
        total_voters: Number(row.total_voters || 0),
        supporters: Number(row.supporters || 0),
        undecided: Number(row.undecided || 0),
        opposed: Number(row.opposed || 0),
        support_percentage: Number(row.support_percentage || 0),
        last_updated: row.last_updated,
      }));
    }
    const wMap: Record<string, { total: number; supporters: number; undecided: number; opposed: number; latestUpdate: string }> = {};
    wards.forEach((w) => { wMap[w] = { total: 0, supporters: 0, undecided: 0, opposed: 0, latestUpdate: "" }; });
    voters.forEach((v) => {
      const wk = (v.ward || "Unassigned").trim();
      if (!wMap[wk]) wMap[wk] = { total: 0, supporters: 0, undecided: 0, opposed: 0, latestUpdate: "" };
      wMap[wk].total++;
      if (v.support_status === "Supporter") wMap[wk].supporters++;
      else if (v.support_status === "Opposed") wMap[wk].opposed++;
      else wMap[wk].undecided++;
      if (v.updated_at && (!wMap[wk].latestUpdate || v.updated_at > wMap[wk].latestUpdate)) wMap[wk].latestUpdate = v.updated_at;
    });
    return Object.entries(wMap).map(([rawWard, data]) => ({
      ward: rawWard,
      display_name: formatWardDisplay(rawWard),
      total_voters: data.total,
      supporters: data.supporters,
      undecided: data.undecided,
      opposed: data.opposed,
      support_percentage: data.total > 0 ? Math.round((data.supporters / data.total) * 1000) / 10 : 0,
      last_updated: data.latestUpdate,
    }));
  }, [voters, wards, supabaseWardStats]);

  const totals = useMemo(() => {
    const totalWardsWithVoters = wardStatisticsList.filter((w) => w.total_voters > 0).length;
    const totalVoters = voters.length;
    const totalSupporters = voters.filter((v) => v.support_status === "Supporter").length;
    const totalUndecided = voters.filter((v) => v.support_status === "Undecided" || !v.support_status).length;
    const totalOpposed = voters.filter((v) => v.support_status === "Opposed").length;
    const overallPct = totalVoters > 0 ? Math.round((totalSupporters / totalVoters) * 1000) / 10 : 0;
    const topWard = [...wardStatisticsList].sort((a, b) => b.total_voters - a.total_voters)[0];
    return { totalWardsWithVoters, totalVoters, totalSupporters, totalUndecided, totalOpposed, overallPct, topWard };
  }, [wardStatisticsList, voters]);

  const filteredStats = useMemo(() => {
    return wardStatisticsList
      .filter((item) => {
        const term = searchTerm.toLowerCase().trim();
        return !term || item.ward.toLowerCase().includes(term) || item.display_name.toLowerCase().includes(term);
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === "voters") diff = b.total_voters - a.total_voters;
        else if (sortBy === "supporters") diff = b.supporters - a.supporters;
        else if (sortBy === "percentage") diff = b.support_percentage - a.support_percentage;
        else diff = a.display_name.localeCompare(b.display_name, undefined, { numeric: true });
        return sortOrder === "desc" ? diff : -diff;
      });
  }, [wardStatisticsList, searchTerm, sortBy, sortOrder]);

  const handleExportWardCSV = () => {
    const headers = ["Ward Name", "Raw Key", "Total Voters", "Supporters", "Undecided", "Opposed", "Support Rate (%)"];
    const rows = filteredStats.map((item) => [
      `"${item.display_name}"`, `"${item.ward}"`, item.total_voters,
      item.supporters, item.undecided, item.opposed, `${item.support_percentage}%`,
    ]);
    const csv = [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Ward_Statistics_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleWardProfileClose = () => {
    setEditingWardProfile(null);
    (async () => {
      const map: Record<string, string> = {};
      for (const w of wards) { const p = await getWardPhoto(w); if (p) map[w] = p; }
      setWardPhotos(map);
    })();
  };

  if (!isOpen) return null;

  const editingWardStat = editingWardProfile ? wardStatisticsList.find((s) => s.ward === editingWardProfile) : null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-100 overflow-hidden my-auto flex flex-col max-h-[92vh]">
          <div className="p-4 sm:p-6 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
                <BarChart2 className="w-6 h-6 text-sky-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg sm:text-xl">Ward Statistics &amp; Analytics</h3>
                  <span className="bg-sky-400/25 border border-sky-300/40 text-sky-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Mendi Central</span>
                </div>
                <p className="text-xs text-indigo-100/90 mt-0.5">Click Edit on any ward to set its profile photo &amp; rename it</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="text-white/80 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5">
                <div className="text-[11px] font-bold uppercase text-slate-500 mb-1 flex items-center justify-between">
                  <span>Active Wards</span><Users className="w-3.5 h-3.5 text-indigo-500" />
                </div>
                <div className="text-2xl font-black text-slate-900">{totals.totalWardsWithVoters}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">of {wards.length} district wards</div>
              </div>
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5">
                <div className="text-[11px] font-bold uppercase text-emerald-700 mb-1 flex items-center justify-between">
                  <span>Supporters</span><CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-emerald-800">{totals.totalSupporters}</div>
                <div className="text-[11px] text-emerald-600 mt-0.5">{totals.overallPct}% of all voters</div>
              </div>
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5">
                <div className="text-[11px] font-bold uppercase text-amber-700 mb-1 flex items-center justify-between">
                  <span>Undecided</span><HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-amber-800">{totals.totalUndecided}</div>
                <div className="text-[11px] text-amber-600 mt-0.5">Key outreach targets</div>
              </div>
              <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-3.5">
                <div className="text-[11px] font-bold uppercase text-rose-700 mb-1 flex items-center justify-between">
                  <span>Opposed</span><AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-rose-800">{totals.totalOpposed}</div>
                <div className="text-[11px] text-rose-600 mt-0.5">Needs persuasion</div>
              </div>
              <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-3.5">
                <div className="text-[11px] font-bold uppercase text-indigo-700 mb-1 flex items-center justify-between">
                  <span>Top Ward</span><TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div className="text-sm font-black text-indigo-900 truncate">{totals.topWard ? totals.topWard.display_name : "-"}</div>
                <div className="text-[11px] text-indigo-600 mt-0.5">{totals.topWard?.total_voters || 0} voters</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="Search ward..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                {searchTerm && (
                  <button onClick={() => setSearchTerm("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                  <span className="text-[11px] text-slate-500 px-2">Sort:</span>
                  {(["voters", "supporters", "percentage"] as const).map((key) => (
                    <button key={key} type="button"
                      onClick={() => { if (sortBy === key) setSortOrder(sortOrder === "desc" ? "asc" : "desc"); else { setSortBy(key); setSortOrder("desc"); } }}
                      className={`px-2 py-1 rounded-lg font-bold cursor-pointer transition-colors ${sortBy === key ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                    >
                      {key === "percentage" ? "Rate %" : key.charAt(0).toUpperCase() + key.slice(1)}
                      {sortBy === key && (sortOrder === "desc" ? " ↓" : " ↑")}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={handleExportWardCSV}
                  className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0">
                  <Download className="w-3.5 h-3.5 text-slate-600" /><span className="hidden sm:inline">Export CSV</span>
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Ward Profile</th>
                    <th className="py-3 px-4 text-center">Total</th>
                    <th className="py-3 px-4 text-center">Supporters</th>
                    <th className="py-3 px-4 text-center">Undecided</th>
                    <th className="py-3 px-4 text-center">Opposed</th>
                    <th className="py-3 px-4 text-center">Rate</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredStats.length === 0 ? (
                    <tr><td colSpan={7} className="py-10 text-center text-slate-400">No matching wards found.</td></tr>
                  ) : (
                    filteredStats.map((item) => {
                      const hasVoters = item.total_voters > 0;
                      const wardPhoto = wardPhotos[item.ward];
                      return (
                        <tr key={item.ward} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="relative shrink-0">
                                <img
                                  src={wardPhoto || generateDummyWardPhoto(item.ward)}
                                  alt={item.display_name}
                                  className={`w-10 h-10 rounded-xl object-cover shadow-xs ${
                                    wardPhoto
                                      ? "border-2 border-indigo-500 ring-2 ring-indigo-100"
                                      : "border border-slate-200"
                                  }`}
                                />
                                {wardPhoto && (
                                  <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white" />
                                )}
                              </div>
                              <div>
                                <span className="text-slate-900 font-bold block">{item.display_name}</span>
                                <span className="text-[10px] text-slate-400">Mendi Central District</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-800">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${hasVoters ? "bg-slate-100 text-slate-800" : "text-slate-400"}`}>{item.total_voters}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`font-bold ${item.supporters > 0 ? "text-emerald-700" : "text-slate-400"}`}>{item.supporters}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`font-medium ${item.undecided > 0 ? "text-amber-700" : "text-slate-400"}`}>{item.undecided}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`font-medium ${item.opposed > 0 ? "text-rose-600" : "text-slate-400"}`}>{item.opposed}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {hasVoters ? (
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-14 bg-slate-200 rounded-full h-2 overflow-hidden shrink-0">
                                  <div className={`h-full rounded-full transition-all duration-300 ${item.support_percentage >= 50 ? "bg-emerald-500" : item.support_percentage >= 25 ? "bg-amber-500" : "bg-rose-400"}`}
                                    style={{ width: `${Math.min(item.support_percentage, 100)}%` }} />
                                </div>
                                <span className="font-bold text-[11px] text-slate-800 w-8 text-right">{item.support_percentage}%</span>
                              </div>
                            ) : <span className="text-slate-300 text-[11px]">-</span>}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button type="button" onClick={() => setEditingWardProfile(item.ward)}
                                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors cursor-pointer text-[11px] flex items-center gap-1.5">
                                <Pencil className="w-3 h-3" /><span className="hidden sm:inline">Edit</span>
                              </button>
                              {onSelectWardFilter && hasVoters && (
                                <button type="button" onClick={() => { onSelectWardFilter(item.ward); onClose(); }}
                                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg transition-colors cursor-pointer text-[11px] flex items-center gap-1.5">
                                  <Users className="w-3 h-3" /><span className="hidden sm:inline">Voters</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>Real-time analytics from <strong>{voters.length}</strong> active voter records</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-colors cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      </div>

      {editingWardProfile && editingWardStat && (
        <WardProfileModal
          ward={editingWardProfile}
          stat={editingWardStat}
          onClose={handleWardProfileClose}
          onEditWard={onEditWard}
          onOpenWardCamera={onOpenWardCamera}
        />
      )}
    </>
  );
}
