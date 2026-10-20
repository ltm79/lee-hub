import { useEffect, useState } from "react";
import { localWeather, type WeatherReport } from "@/lib/portal.functions";

export function LocalConditions({ city }: { city: string }) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<Extract<WeatherReport, { ok: true }> | null>(null);
  const [weatherStatus, setWeatherStatus] = useState<"loading" | "ready" | "off">("loading");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancel = false;
    setWeatherStatus("loading");
    localWeather({ data: { city } })
      .then((report) => {
        if (cancel) return;
        if (report.ok) {
          setWeather(report);
          setWeatherStatus("ready");
        } else {
          setWeather(null);
          setWeatherStatus("off");
        }
      })
      .catch(() => {
        if (!cancel) setWeatherStatus("off");
      });
    return () => {
      cancel = true;
    };
  }, [city]);

  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now);
  const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(now);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(now);
  const place = weather?.place || city.trim() || "Local";

  return (
    <section
      className="mt-4 inline-flex max-w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 shadow-card"
      aria-label="Date and weather"
      suppressHydrationWarning
    >
      <div className="min-w-0">
        <p className="text-[11px] leading-4 text-muted">{weekday}</p>
        <p className="text-sm font-semibold tracking-tight">
          {monthDay}
          <span className="ml-1.5 font-normal text-faint">{time}</span>
        </p>
      </div>
      <span className="h-8 w-px shrink-0 bg-line" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-[11px] leading-4 text-muted">{place}</p>
        {weatherStatus === "loading" ? (
          <span className="mt-1 block h-4 w-16 animate-pulse rounded-sm bg-blush" />
        ) : weatherStatus === "ready" && weather ? (
          <p className="truncate text-sm font-semibold tracking-tight">
            {weather.temp}°
            <span className="ml-1.5 font-normal text-muted">{weather.condition}</span>
            <span className="ml-1.5 font-normal text-faint">
              {weather.high}°/{weather.low}°
            </span>
          </p>
        ) : (
          <p className="text-sm text-faint">Weather unavailable</p>
        )}
      </div>
    </section>
  );
}
