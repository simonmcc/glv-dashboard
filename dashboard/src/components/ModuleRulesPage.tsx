import { MODULE_CONFIG } from "../utils";

interface ModuleRulesPageProps {
  onBack: () => void;
}

function formatDeadline(deadlineDays: number | null): string {
  if (deadlineDays === null) return "None";
  if (deadlineDays === 365) return "365 days (~1 year)";
  return `${deadlineDays} days`;
}

export function ModuleRulesPage({ onBack }: ModuleRulesPageProps) {
  const groups = Array.from(
    new Set(MODULE_CONFIG.map((m) => m.group)),
  ) as (string | null)[];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            ← Back to Dashboard
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Module Rules</h1>
            <p className="text-sm text-gray-500">
              Deadline and grouping rules configured for each learning module.{" "}
              <a
                href="https://github.com/simonmcc/glv-dashboard/blob/main/dashboard/src/utils.ts"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 hover:text-purple-800 hover:underline"
              >
                Edit in utils.ts ↗
              </a>
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {groups.map((group) => {
          const modules = MODULE_CONFIG.filter((m) => m.group === group);
          const sectionTitle = group ?? "Standalone";

          return (
            <section key={sectionTitle} className="bg-white rounded-lg shadow-sm border">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b bg-gray-50 rounded-t-lg">
                {sectionTitle}
              </h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">
                      Module
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">
                      Deadline from role start
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">
                      Auto-synthesised if missing
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {modules.map((m) => (
                    <tr key={m.name} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {m.name}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {m.deadlineDays !== null ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            {formatDeadline(m.deadlineDays)}
                          </span>
                        ) : (
                          <span className="text-gray-400">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {m.synthesizeIfMissing ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ✓ Yes
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </main>
    </div>
  );
}

export default ModuleRulesPage;
