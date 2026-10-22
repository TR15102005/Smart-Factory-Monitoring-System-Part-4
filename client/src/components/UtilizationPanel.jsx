import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar
} from 'recharts';

const fmtTime = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function UtilizationPanel({ data }) {
  const series = data?.series || [];
  const perRobot = (data?.perRobot || []).slice(0, 10);

  return (
    <section className="panel">
      <h2>Robot Utilization — last 12 hours</h2>
      <div className="charts-row">
        <div className="chart-box">
          <h3>Fleet utilization over time</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="utilGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f9cf9" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#4f9cf9" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3350" />
              <XAxis dataKey="time" tickFormatter={fmtTime} stroke="#8b96b8" fontSize={11} />
              <YAxis domain={[0, 100]} stroke="#8b96b8" fontSize={11} />
              <Tooltip
                labelFormatter={fmtTime}
                contentStyle={{ background: '#141a2e', border: '1px solid #2a3350', borderRadius: 8 }}
                labelStyle={{ color: '#c7d0e8' }}
              />
              <Area type="monotone" dataKey="avgUtilization" name="Avg utilization %"
                stroke="#4f9cf9" fill="url(#utilGrad)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-box">
          <h3>Top robots by average utilization</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={perRobot} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3350" />
              <XAxis type="number" domain={[0, 100]} stroke="#8b96b8" fontSize={11} />
              <YAxis type="category" dataKey="robotId" stroke="#8b96b8" fontSize={11} width={60} />
              <Tooltip contentStyle={{ background: '#141a2e', border: '1px solid #2a3350', borderRadius: 8 }} />
              <Bar dataKey="avgUtilization" name="Avg %" fill="#37c98b" radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
