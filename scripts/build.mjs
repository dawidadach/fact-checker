// Buduje paczki wtyczki dla Chrome, Edge i Opery z jednego kodu źródłowego.
//   node scripts/build.mjs            → dist/fact-checker-{chrome,edge,opera}/ (+ .zip, jeśli jest `zip`)
//   node scripts/build.mjs opera      → tylko Opera
// Kod jest wspólny; różni się tylko manifest:
//   Chrome, Edge – natywny panel boczny (side_panel + uprawnienie sidePanel; Edge ma to samo API co Chrome),
//   Opera        – pasek boczny Opery (sidebar_action); bez chrome.sidePanel wtyczka sama otwiera panel w okienku.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
// Do paczki nie trafiają: testy, skrypty, zrzuty do README, pliki repozytorium.
const SKIP = new Set(["dist", "tests", "scripts", "docs", "node_modules", ".git", ".github", ".gitignore", "package.json", "package-lock.json"]);

const base = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

const TARGETS = {
  chrome(m) {
    m.version_name = `${base.version_name || base.version}-chrome`;
    return m;
  },
  edge(m) {
    m.version_name = `${base.version_name || base.version}-edge`;
    return m;
  },
  opera(m) {
    delete m.side_panel;
    m.permissions = m.permissions.filter((p) => p !== "sidePanel");
    const out = {};
    for (const [k, v] of Object.entries(m)) {
      out[k] = v;
      if (k === "action") {
        out.sidebar_action = { default_panel: "sidepanel.html", default_title: m.action.default_title, default_icon: m.action.default_icon };
      }
    }
    out.version_name = `${base.version_name || base.version}-opera`;
    return out;
  },
};

const wanted = process.argv.slice(2).filter((a) => TARGETS[a]);
for (const target of wanted.length ? wanted : Object.keys(TARGETS)) {
  const name = `fact-checker-${target}`;
  const dir = join(DIST, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(ROOT)) {
    if (!SKIP.has(entry)) cpSync(join(ROOT, entry), join(dir, entry), { recursive: true });
  }
  const manifest = TARGETS[target](structuredClone(base));
  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const zip = join(DIST, `${name}.zip`);
  rmSync(zip, { force: true });
  const z = spawnSync("zip", ["-qr", `${name}.zip`, name], { cwd: DIST });
  console.log(`✓ ${relative(ROOT, dir)}${!z.error && z.status === 0 ? ` + ${relative(ROOT, zip)}` : " (bez .zip – brak programu zip)"}  [${manifest.version_name}]`);
}
if (!existsSync(DIST)) process.exit(1);
