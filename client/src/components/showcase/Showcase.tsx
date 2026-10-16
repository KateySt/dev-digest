/* Showcase.tsx — renders every design-system component for visual verification.
   Used by the smoke tests (both themes).
   Dev-only page: labels are intentionally not internationalized. */
"use client";

import React from "react";
import { AutoTriggerStatus } from "@/components/auto-trigger-status";
import { BarRow, Donut, LineChart, MetricCard, Sparkline } from "@/components/charts";
import { CircularScore } from "@/components/circular-score";
import { CodeField } from "@/components/code-field";
import { Combobox } from "@/components/combobox";
import { ConfidenceNum } from "@/components/confidence-num";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { FilterChip } from "@/components/filter-chip";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { LiveLogStream } from "@/components/live-log-stream";
import { Markdown } from "@/components/markdown";
import { MonoLink } from "@/components/mono-link";
import { PageTabs } from "@/components/page-tabs";
import { SectionLabel } from "@/components/section-label";
import { SelectField } from "@/components/select-field";
import { CategoryTag, SeverityBadge } from "@/components/severity";
import { UserAvatar } from "@/components/user-avatar";
import { WizardSteps } from "@/components/wizard-steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES, MODEL_OPTIONS, SEVERITIES } from "./constants";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <SectionLabel>{title}</SectionLabel>
      <div className="flex flex-wrap items-center gap-3.5">{children}</div>
    </section>
  );
}

export function Gallery() {
  const [toggle, setToggle] = React.useState(true);
  const [check, setCheck] = React.useState(true);
  const [tab, setTab] = React.useState("a");
  const [text, setText] = React.useState("");
  const [sel, setSel] = React.useState("gpt-4.1");
  const [drawer, setDrawer] = React.useState(false);
  const [modal, setModal] = React.useState(false);
  const [code, setCode] = React.useState("# Rubric\n\nEvaluate for **correctness** and _security_.\n");

  return (
    <div className="bg-background p-8 text-foreground">
      <Group title="Buttons">
        <Button>
          <Icon.Sparkles aria-hidden />
          Primary
        </Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost" data-active>
          Tertiary
        </Button>
        <Button variant="outline">
          <Icon.Filter aria-hidden />
          Ghost
        </Button>
        <Button variant="destructive">
          <Icon.Trash aria-hidden />
          Danger
        </Button>
        <Button size="sm">
          Small
          <Icon.ChevronDown aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Refresh" title="Refresh">
          <Icon.RefreshCw aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" data-active aria-label="Notifications" title="Notifications">
          <Icon.Bell aria-hidden />
        </Button>
      </Group>

      <Group title="Badges & Severity (icon + label, WCAG AA)">
        {SEVERITIES.map((sev) => (
          <SeverityBadge key={sev} severity={sev} count={3} />
        ))}
        {SEVERITIES.map((sev) => (
          <SeverityBadge key={`${sev}-compact`} severity={sev} count={3} compact />
        ))}
        <Badge variant="neutral">
          <Icon.GitBranch aria-hidden />
          branch
        </Badge>
        <Badge variant="ok" className="bg-transparent">
          <span aria-hidden className="size-1.5 rounded-full bg-ok" />
          synced
        </Badge>
        {CATEGORIES.map((c) => (
          <CategoryTag key={c} category={c} />
        ))}
      </Group>

      <Group title="Chips, Avatars, Confidence, MonoLink, Kbd">
        <FilterChip active icon="Check">
          Active
        </FilterChip>
        <FilterChip icon="Plus" count={4}>
          Add
        </FilterChip>
        <UserAvatar name="Ada Lovelace" />
        <UserAvatar name="you" size={28} />
        <ConfidenceNum value={0.91} />
        <ConfidenceNum value={0.6} />
        <MonoLink>src/config.ts:12</MonoLink>
        <Kbd>⌘K</Kbd>
        <Switch checked={toggle} onCheckedChange={setToggle} aria-label="Toggle" />
      </Group>

      <Group title="Progress & Score">
        <div className="w-50">
          <Progress value={64} className="h-1.5 bg-accent" aria-label="Progress" />
        </div>
        <CircularScore score={82} />
        <CircularScore score={48} size={36} stroke={3.5} />
      </Group>

      <Group title="Cards & States">
        <div className="w-60 rounded-lg border border-border bg-elevated p-(--card-pad)">
          <div className="font-semibold">Card title</div>
          <div className="mt-1.25 text-base text-muted-foreground">Elevated surface.</div>
        </div>
        <div className="w-70">
          <EmptyState icon="GitPullRequest" title="No pull requests" body="Refresh to sync from GitHub." cta="Add repo" />
        </div>
        <div className="w-75">
          <ErrorState title="Engine unreachable" body="Is the API running on :3001?" onRetry={() => {}} />
        </div>
        <div className="flex w-50 flex-col gap-2.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[70%]" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Group>

      <Group title="Markdown">
        <div className="w-105">
          <Markdown>{"A finding with **bold**, `inline code`, and a [link](https://example.com).\n\n- one\n- two"}</Markdown>
        </div>
      </Group>

      <Group title="Form controls (real, controlled)">
        <div className="w-70">
          <FormField label="API key" hint="Stored locally." required htmlFor="showcase-key">
            <Input
              id="showcase-key"
              className="mono"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="sk-…"
            />
          </FormField>
        </div>
        <div className="w-55">
          <FormField label="Model">
            <SelectField value={sel} onChange={setSel} options={[...MODEL_OPTIONS]} ariaLabel="Model" />
          </FormField>
        </div>
        <div className="w-55">
          <FormField label="Model (searchable)">
            <Combobox value={sel} onChange={setSel} options={[...MODEL_OPTIONS]} />
          </FormField>
        </div>
        <div className="w-70">
          <FormField label="Notes" htmlFor="showcase-notes">
            <Textarea
              id="showcase-notes"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Free text…"
              rows={3}
            />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={check} onCheckedChange={(v) => setCheck(v === true)} />
          On new PR
        </label>
        <div className="w-105">
          <FormField label="Skill body">
            <CodeField value={code} onChange={setCode} filename="pr-quality-rubric.md" dirty minHeight={140} />
          </FormField>
        </div>
      </Group>

      <Group title="Tabs / Dropdown / Overlays">
        <div className="w-90">
          <PageTabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "a", label: "Config", icon: "Settings" },
              { key: "b", label: "Skills", icon: "Sparkles", count: 3 },
              { key: "c", label: "Evals", icon: "FlaskConical" },
            ]}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              Menu
              <Icon.ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>
              <Icon.Play aria-hidden />
              Run all
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-muted-foreground">
              <Icon.Settings aria-hidden />
              Configure…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" onClick={() => setDrawer(true)}>
          Open Drawer
        </Button>
        <Button variant="outline" onClick={() => setModal(true)}>
          Open Modal
        </Button>
      </Group>

      <Group title="Charts">
        <Sparkline data={[3, 5, 2, 8, 6, 9, 7]} />
        <div className="w-90">
          <LineChart
            series={[
              { name: "recall", color: "var(--accent)", data: [0.7, 0.74, 0.8, 0.78, 0.85, 0.9] },
              { name: "precision", color: "var(--ok)", data: [0.65, 0.7, 0.72, 0.8, 0.82, 0.88] },
            ]}
            h={160}
          />
        </div>
        <Donut
          segments={[
            { label: "openai", value: 4.2, color: "var(--accent)" },
            { label: "anthropic", value: 2.1, color: "var(--ok)" },
          ]}
        />
        <div className="w-80">
          <BarRow label="security-agent" value={42} max={60} suffix="42" />
          <BarRow label="perf-agent" value={28} max={60} color="var(--ok)" suffix="28" />
        </div>
        <div className="w-50">
          <MetricCard label="ACCEPT RATE" value="68" suffix="%" delta={0.04} trend={[0.6, 0.62, 0.65, 0.68]} />
        </div>
      </Group>

      <Group title="Shared (LiveLog / Wizard steps / Auto-trigger)">
        <div className="w-115">
          <LiveLogStream
            height={120}
            log={[
              { t: "0.1", k: "info", m: "assembling prompt" },
              { t: "0.4", k: "tool", m: "grep_repo(rate.limit)" },
              { t: "1.2", k: "result", m: "3 findings" },
              { t: "1.3", k: "error", m: "citation rejected: src/x.ts:9" },
            ]}
          />
        </div>
        <div className="w-115">
          <WizardSteps step={1} labels={["Target", "Preview", "Configure", "Install"]} />
        </div>
        <AutoTriggerStatus on />
        <AutoTriggerStatus on={false} />
      </Group>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Example Drawer</SheetTitle>
            <SheetDescription>720px wide</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <p className="text-muted-foreground">Drawer body content.</p>
          </SheetBody>
        </SheetContent>
      </Sheet>
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Example Modal</DialogTitle>
            <DialogDescription>centered</DialogDescription>
          </DialogHeader>
          <DialogBody className="p-6">Modal body content.</DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
