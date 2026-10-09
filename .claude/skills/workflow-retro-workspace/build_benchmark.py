import json, statistics as st, sys
from pathlib import Path
it = Path(sys.argv[1])
evals = {"full-session-retro":1,"spec-creator-scope":2,"no-agents-session":3}
runs=[]; agg={"with_skill":[], "without_skill":[]}
for name,eid in evals.items():
    for cfg in ("with_skill","without_skill"):
        d=it/name/cfg; g=json.loads((d/"grading.json").read_text()); t=json.loads((d/"timing.json").read_text())
        s=g["summary"]
        r={"pass_rate":s["pass_rate"],"passed":s["passed"],"failed":s["failed"],"total":s["total"],"time_seconds":t["total_duration_seconds"],"tokens":t["total_tokens"],"tool_calls":0,"errors":0}
        runs.append({"eval_id":eid,"eval_name":name,"configuration":cfg,"run_number":1,"result":r,"expectations":g["expectations"],"notes":[]})
        agg[cfg].append(r)
def stat(v):
    return {"mean":round(st.mean(v),3),"stddev":round(st.pstdev(v),3),"min":min(v),"max":max(v)}
summ={c:{"pass_rate":stat([r["pass_rate"] for r in rs]),"time_seconds":stat([r["time_seconds"] for r in rs]),"tokens":stat([r["tokens"] for r in rs])} for c,rs in agg.items()}
w,wo=summ["with_skill"],summ["without_skill"]
delta={"pass_rate":f"{w['pass_rate']['mean']-wo['pass_rate']['mean']:+.2f}","time_seconds":f"{w['time_seconds']['mean']-wo['time_seconds']['mean']:+.1f}","tokens":f"{w['tokens']['mean']-wo['tokens']['mean']:+.0f}"}
out={"metadata":{"skill_name":"workflow-retro","skill_path":".claude/skills/workflow-retro","executor_model":"claude-sonnet-5-5","analyzer_model":"claude-sonnet-5-5","timestamp":"2026-10-06T00:00:00Z","evals_run":[1,2,3],"runs_per_configuration":1},"runs":runs,"run_summary":{**summ,"delta":delta},"notes":[]}
(it/"benchmark.json").write_text(json.dumps(out,indent=2))
print(json.dumps({"summary":summ,"delta":delta},indent=1))
for r in runs: print(r["eval_name"],r["configuration"],r["result"]["passed"],"/",r["result"]["total"])
