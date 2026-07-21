import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, ArrowLeft, Sparkles, Download, Loader2, Compass, TrendingUp, Building2, Target, BookOpen, MapPin, DollarSign, RefreshCw } from "lucide-react";
import jsPDF from "jspdf";
import { generateCareerReport, type CareerInput, type CareerReport } from "@/lib/career.functions";

export const Route = createFileRoute("/")({
  component: Home,
});

const STEPS = [
  { key: "fullName", label: "What's your full name?", placeholder: "e.g. Aarav Sharma", type: "text" },
  { key: "age", label: "How old are you?", placeholder: "e.g. 22", type: "text" },
  { key: "education", label: "Your educational background", placeholder: "e.g. B.Tech Computer Science, 2024", type: "textarea" },
  { key: "skills", label: "Current skills", placeholder: "e.g. Python, SQL, data visualization, communication", type: "textarea" },
  { key: "interests", label: "Areas of interest", placeholder: "e.g. AI, sustainability, storytelling, finance", type: "textarea" },
  { key: "personality", label: "Personality traits", placeholder: "e.g. Introverted, analytical, detail-oriented", type: "textarea" },
  { key: "workStyle", label: "Preferred work style", placeholder: "Remote / Office / Hybrid — and why", type: "textarea" },
  { key: "location", label: "Where are you based?", placeholder: "e.g. Bengaluru, India", type: "text" },
] as const;

const EMPTY: CareerInput = { fullName: "", age: "", education: "", skills: "", interests: "", personality: "", workStyle: "", location: "" };

function Home() {
  const generate = useServerFn(generateCareerReport);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CareerInput>(EMPTY);
  const [report, setReport] = useState<CareerReport | null>(null);

  const mutation = useMutation({
    mutationFn: (data: CareerInput) => generate({ data }),
    onSuccess: (r) => setReport(r),
  });

  const isResults = report !== null;
  const isForm = step > 0 && !isResults;
  const isLanding = step === 0 && !isResults;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      {isLanding && <Landing onStart={() => setStep(1)} />}
      {isForm && (
        <FormFlow
          step={step}
          form={form}
          setForm={setForm}
          setStep={setStep}
          submit={() => mutation.mutate(form)}
          loading={mutation.isPending}
          error={mutation.error?.message}
        />
      )}
      {isResults && report && (
        <Results
          report={report}
          name={form.fullName}
          location={form.location}
          onRestart={() => { setReport(null); setForm(EMPTY); setStep(0); mutation.reset(); }}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Compass className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-semibold">Northstar</span>
        </div>
        <span className="text-xs uppercase tracking-widest text-muted-foreground hidden sm:block">AI Career Guidance</span>
      </div>
    </header>
  );
}

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden bg-grid">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground mb-6">
            <Sparkles className="w-3 h-3 text-coral" />
            Personalized career analysis in under a minute
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-semibold leading-[0.95] text-balance">
            Find the work<br />
            <span className="italic text-coral">you were built for.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl text-balance">
            Answer eight quick questions. Get five best-fit careers with match scores, salary ranges, learning roadmaps, and a downloadable report — grounded in your skills, personality, and location.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <button onClick={onStart} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition">
              Start assessment <ArrowRight className="w-4 h-4" />
            </button>
            <div className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-3 text-xs text-muted-foreground">
              ~60 seconds • 8 questions • Free
            </div>
          </div>
        </div>

        <div className="mt-24 grid md:grid-cols-3 gap-4">
          {[
            { icon: Target, title: "5 tailored careers", desc: "Ranked by match percentage against your profile." },
            { icon: BookOpen, title: "Learning roadmap", desc: "Courses, certifications, and projects to close skill gaps." },
            { icon: Download, title: "Downloadable report", desc: "Take your full analysis with you as a PDF." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <f.icon className="w-5 h-5 text-coral" />
              <h3 className="mt-4 font-display text-lg">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FormFlow({ step, form, setForm, setStep, submit, loading, error }: {
  step: number;
  form: CareerInput;
  setForm: (f: CareerInput) => void;
  setStep: (n: number) => void;
  submit: () => void;
  loading: boolean;
  error?: string;
}) {
  const idx = step - 1;
  const current = STEPS[idx];
  const value = form[current.key];
  const isLast = idx === STEPS.length - 1;
  const canNext = value.trim().length > 0;

  const next = () => {
    if (!canNext) return;
    if (isLast) submit();
    else setStep(step + 1);
  };

  return (
    <section className="mx-auto max-w-2xl px-6 py-16 md:py-24">
      <div className="mb-10">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <span>Question {step} of {STEPS.length}</span>
          <span>{Math.round((step / STEPS.length) * 100)}%</span>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-coral transition-all duration-500" style={{ width: `${(step / STEPS.length) * 100}%` }} />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-coral" />
          <h2 className="font-display text-3xl mt-6">Analyzing your profile…</h2>
          <p className="text-muted-foreground mt-2">Matching your traits against thousands of career paths.</p>
        </div>
      ) : (
        <div className="animate-in fade-in duration-500" key={step}>
          <h2 className="font-display text-4xl md:text-5xl font-semibold text-balance leading-tight">{current.label}</h2>
          <div className="mt-8">
            {current.type === "textarea" ? (
              <textarea
                autoFocus
                value={value}
                onChange={(e) => setForm({ ...form, [current.key]: e.target.value })}
                placeholder={current.placeholder}
                rows={4}
                className="w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            ) : (
              <input
                autoFocus
                value={value}
                onChange={(e) => setForm({ ...form, [current.key]: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") next(); }}
                placeholder={current.placeholder}
                className="w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </div>

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={next}
              disabled={!canNext}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition"
            >
              {isLast ? "Generate report" : "Continue"} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Results({ report, name, location, onRestart }: { report: CareerReport; name: string; location: string; onRestart: () => void }) {
  const download = () => generatePDF(report, name, location);

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-10">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Report for {name || "you"}</div>
          <h1 className="font-display text-4xl md:text-5xl font-semibold mt-2 text-balance">Your career map</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground text-balance">{report.summary}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={download} className="inline-flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-medium text-coral-foreground hover:bg-coral/90 transition">
            <Download className="w-4 h-4" /> Download PDF
          </button>
          <button onClick={onRestart} className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm hover:bg-muted transition">
            <RefreshCw className="w-4 h-4" /> Restart
          </button>
        </div>
      </div>

      <div className="grid gap-4 mb-12">
        {report.topCareers.map((c, i) => <CareerCard key={i} c={c} rank={i + 1} />)}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-2xl mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-coral" /> Alternative paths</h3>
          <ul className="space-y-3">
            {report.alternatives.map((a, i) => (
              <li key={i} className="border-l-2 border-coral/40 pl-3">
                <div className="font-medium">{a.title}</div>
                <div className="text-sm text-muted-foreground">{a.reason}</div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-2xl mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-coral" /> Networking tips</h3>
          <ul className="space-y-2">
            {report.networkingTips.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-coral shrink-0">→</span> <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function CareerCard({ c, rank }: { c: CareerReport["topCareers"][number]; rank: number }) {
  const [open, setOpen] = useState(rank === 1);
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full text-left p-6 flex items-start gap-4 hover:bg-muted/30 transition">
        <div className="font-display text-3xl text-muted-foreground w-10 shrink-0">{String(rank).padStart(2, "0")}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="font-display text-2xl md:text-3xl">{c.title}</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-coral/10 text-coral px-3 py-0.5 text-xs font-medium">
              {c.matchPercentage}% match
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
        </div>
        <ArrowRight className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border p-6 grid md:grid-cols-2 gap-6 animate-in fade-in duration-300">
          <Block icon={DollarSign} title="Salary range">
            <div className="text-sm"><MapPin className="w-3 h-3 inline mr-1" />{c.salaryLocal}</div>
            <div className="text-sm text-muted-foreground mt-1">Global: {c.salaryGlobal}</div>
          </Block>
          <Block icon={TrendingUp} title="Demand & outlook">
            <div className="text-sm font-medium">{c.demand}</div>
            <div className="text-sm text-muted-foreground mt-1">{c.growthOutlook}</div>
          </Block>

          <Block title="Required skills">
            <div className="flex flex-wrap gap-1.5">
              {c.requiredSkills.map((s) => <Tag key={s}>{s}</Tag>)}
            </div>
          </Block>
          <Block title="Your skill gaps">
            <div className="flex flex-wrap gap-1.5">
              {c.skillGaps.map((s) => <Tag key={s} variant="coral">{s}</Tag>)}
            </div>
          </Block>

          <Block icon={BookOpen} title="Learning roadmap" full>
            <ol className="space-y-2">
              {c.learningRoadmap.map((r, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shrink-0">{i + 1}</span>
                  <div>
                    <div className="font-medium">{r.step}</div>
                    <div className="text-muted-foreground">{r.resource} <span className="text-xs uppercase tracking-wider ml-1 opacity-60">{r.type}</span></div>
                  </div>
                </li>
              ))}
            </ol>
          </Block>

          <Block icon={Building2} title="Target companies">
            <div className="flex flex-wrap gap-1.5">{c.companies.map((co) => <Tag key={co}>{co}</Tag>)}</div>
          </Block>
          <Block title="Roles to target">
            <ul className="text-sm space-y-1">{c.roles.map((r) => <li key={r}>• {r}</li>)}</ul>
          </Block>

          <Block title="Personality fit" full>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-coral" style={{ width: `${c.personalityCompatibility}%` }} />
              </div>
              <span className="text-sm font-medium">{c.personalityCompatibility}%</span>
            </div>
            <p className="text-sm text-muted-foreground">{c.compatibilityReasoning}</p>
          </Block>

          <Block title="Next steps" full>
            <ul className="grid sm:grid-cols-2 gap-2">
              {c.nextSteps.map((s, i) => (
                <li key={i} className="text-sm flex gap-2 rounded-lg bg-muted/50 p-3">
                  <span className="text-coral">→</span> {s}
                </li>
              ))}
            </ul>
          </Block>
        </div>
      )}
    </div>
  );
}

function Block({ icon: Icon, title, children, full }: { icon?: any; title: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5" />} {title}
      </div>
      {children}
    </div>
  );
}

function Tag({ children, variant }: { children: React.ReactNode; variant?: "coral" }) {
  const cls = variant === "coral"
    ? "bg-coral/10 text-coral border-coral/20"
    : "bg-muted text-foreground border-border";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${cls}`}>{children}</span>;
}

function generatePDF(report: CareerReport, name: string, location: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;

  const check = (needed = 40) => {
    if (y + needed > H - M) { doc.addPage(); y = M; }
  };
  const text = (str: string, size = 10, bold = false, color: [number, number, number] = [30, 30, 45]) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(str, W - M * 2);
    check(lines.length * size * 1.2 + 4);
    doc.text(lines, M, y);
    y += lines.length * size * 1.2 + 4;
  };
  const rule = () => { check(20); doc.setDrawColor(220, 210, 200); doc.line(M, y, W - M, y); y += 14; };
  const h1 = (s: string) => text(s, 22, true);
  const h2 = (s: string) => { y += 6; text(s, 14, true, [200, 90, 50]); };
  const h3 = (s: string) => text(s, 11, true);

  // Cover
  doc.setFillColor(30, 30, 60);
  doc.rect(0, 0, W, 140, "F");
  doc.setTextColor(250, 245, 230);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("NORTHSTAR CAREER REPORT", M, 60);
  doc.setFontSize(26);
  doc.text(name || "Your Career Map", M, 95);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(location || "", M, 115);
  y = 180;

  h2("Summary");
  text(report.summary);
  rule();

  h2("Top 5 Career Recommendations");
  report.topCareers.forEach((c, i) => {
    check(80);
    h3(`${i + 1}. ${c.title}  —  ${c.matchPercentage}% match`);
    text(c.description);
    text(`Salary (Local): ${c.salaryLocal}`);
    text(`Salary (Global): ${c.salaryGlobal}`);
    text(`Demand: ${c.demand}`);
    text(`Growth outlook: ${c.growthOutlook}`);
    text(`Required skills: ${c.requiredSkills.join(", ")}`);
    text(`Skill gaps: ${c.skillGaps.join(", ")}`);
    text(`Learning roadmap:`, 10, true);
    c.learningRoadmap.forEach((r, j) => text(`  ${j + 1}. ${r.step} — ${r.resource} (${r.type})`));
    text(`Target companies: ${c.companies.join(", ")}`);
    text(`Roles: ${c.roles.join(", ")}`);
    text(`Personality fit: ${c.personalityCompatibility}% — ${c.compatibilityReasoning}`);
    text(`Next steps:`, 10, true);
    c.nextSteps.forEach((s) => text(`  • ${s}`));
    y += 6;
    rule();
  });

  h2("Alternative Career Paths");
  report.alternatives.forEach((a) => {
    h3(a.title);
    text(a.reason);
  });
  rule();

  h2("Networking Tips");
  report.networkingTips.forEach((t) => text(`• ${t}`));

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 140, 130);
    doc.text(`Northstar Career Report  •  Page ${i} of ${pages}`, M, H - 20);
  }

  doc.save(`Northstar-Career-Report-${(name || "you").replace(/\s+/g, "-")}.pdf`);
}
