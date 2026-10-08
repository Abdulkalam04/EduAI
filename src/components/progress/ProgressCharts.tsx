import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SoftCard, SectionHeader } from "@/components/ui-custom";
import type { ProgressSnapshot } from "@/lib/types";
type Topic = ProgressSnapshot["mastery"][string][number];

type Props = {
  topics: Topic[];
  activity: ProgressSnapshot["activity"];
  weeklyMinutes: ProgressSnapshot["weeklyMinutes"];
  range: string;
};

const masteryColor = (value: number) =>
  value >= 80 ? "var(--success)" : value >= 50 ? "var(--warning)" : "var(--destructive)";

function activityColor(count: number) {
  if (count === 0) return "bg-muted";
  if (count === 1) return "bg-success/30";
  if (count === 2) return "bg-success/60";
  return "bg-success";
}

export default function ProgressCharts({ topics, activity, weeklyMinutes, range }: Props) {
  const chartTopics = topics.length ? topics : [{ name: "No data", value: 0 }];
  const radarData = chartTopics.slice(0, 8);
  const heatmapDays = range === "All" ? 84 : range === "30 days" ? 30 : 7;
  const heatmap = Array.from({ length: Math.max(0, heatmapDays - activity.length) }, (_, i) => ({
    date: `empty-${i}`,
    count: 0,
  })).concat(activity);
  const ticks =
    weeklyMinutes.length > 1
      ? [weeklyMinutes[0]?.week ?? "", weeklyMinutes.at(-1)?.week ?? ""]
      : weeklyMinutes.map((item) => item.week);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <SoftCard className="min-w-0 p-5">
          <SectionHeader
            title="Topic mastery"
            description="A subject-by-subject view of the concepts you’ve practised."
          />
          {topics.length ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis
                    dataKey="name"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    name="Mastery"
                    dataKey="value"
                    stroke="var(--primary)"
                    fill="var(--primary)"
                    fillOpacity={0.28}
                    isAnimationActive
                  />
                  <Tooltip formatter={(value) => [`${value}%`, "Mastery"]} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Take a quiz to build your mastery chart.
            </div>
          )}
        </SoftCard>
        <SoftCard className="min-w-0 p-5">
          <SectionHeader
            title="Mastery by topic"
            description="Focus first on topics that need more practice."
          />
          {topics.length ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topics}
                  layout="vertical"
                  margin={{ left: 10, right: 12, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={102}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                  <Tooltip formatter={(value) => [`${value}%`, "Mastery"]} />
                  <Bar dataKey="value" radius={[0, 5, 5, 0]} isAnimationActive>
                    {topics.map((entry) => (
                      <Cell key={entry.name} fill={masteryColor(entry.value)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Your topic breakdown will appear here.
            </div>
          )}
        </SoftCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SoftCard className="min-w-0 p-5">
          <SectionHeader
            title="Study activity"
            description={`Your last ${range === "All" ? "12 weeks" : range.toLowerCase()} at a glance.`}
          />
          <div className="overflow-x-auto pb-2">
            <div
              className="grid w-max grid-rows-7 grid-flow-col gap-1"
              role="group"
              aria-label="Daily study activity heatmap"
            >
              {heatmap.map((item, index) => (
                <span
                  key={`${item.date}-${index}`}
                  role="img"
                  title={
                    item.date.startsWith("empty-")
                      ? "No activity"
                      : `${item.date}: ${item.count} questions`
                  }
                  aria-label={
                    item.date.startsWith("empty-")
                      ? "No activity"
                      : `${item.date}, ${item.count} questions`
                  }
                  className={`h-4 w-4 rounded-[3px] ${activityColor(item.count)}`}
                />
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {activity[0]?.date && !activity[0].date.startsWith("empty-")
                ? activity[0].date
                : "12 weeks ago"}
            </span>
            <span className="flex items-center gap-1.5">
              Less <i className="h-3 w-3 rounded-[3px] bg-muted" />
              <i className="h-3 w-3 rounded-[3px] bg-success/30" />
              <i className="h-3 w-3 rounded-[3px] bg-success/60" />
              <i className="h-3 w-3 rounded-[3px] bg-success" /> More
            </span>
            <span>{activity.at(-1)?.date}</span>
          </div>
        </SoftCard>
        <SoftCard className="min-w-0 p-5">
          <SectionHeader
            title="Weekly study time"
            description="Minutes spent learning each week."
          />
          {weeklyMinutes.length ? (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={weeklyMinutes}
                  margin={{ left: -18, right: 8, top: 12, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="minutesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="week"
                    ticks={ticks}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip formatter={(value) => [`${value} min`, "Study time"]} />
                  <Area
                    type="monotone"
                    dataKey="minutes"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    fill="url(#minutesFill)"
                    activeDot={{ r: 5 }}
                    isAnimationActive
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
              Study time will appear after a few sessions.
            </div>
          )}
        </SoftCard>
      </div>
    </>
  );
}
