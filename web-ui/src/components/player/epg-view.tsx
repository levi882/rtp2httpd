import { clsx } from "clsx";
import { Circle, History } from "lucide-react";
import { memo, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePlayerTranslation } from "../../hooks/use-player-translation";
import type { EPGData } from "../../lib/epg-parser";
import type { Locale } from "../../lib/locale";
import type { EPGProgram } from "../../types/player";

interface EPGViewProps {
	channelId: string | null;
	epgData: EPGData;
	onProgramSelect: (programStart: Date, programEnd: Date) => void;
	locale: Locale;
	supportsCatchup: boolean;
	currentPlayingProgram: EPGProgram | null;
	catchupRecentBlockHours: number;
	declaredCatchupLengthSeconds?: number;
}

export const nextScrollBehaviorRef: RefObject<"smooth" | "instant" | "skip"> = { current: "instant" };

function EPGViewComponent({
	channelId,
	epgData,
	onProgramSelect,
	locale,
	supportsCatchup,
	currentPlayingProgram,
	catchupRecentBlockHours,
	declaredCatchupLengthSeconds,
}: EPGViewProps) {
	const t = usePlayerTranslation(locale);
	const currentProgramRef = useRef<HTMLButtonElement>(null);
	const [currentTime, setCurrentTime] = useState(() => new Date());

	useEffect(() => {
		const interval = window.setInterval(() => {
			setCurrentTime(new Date());
		}, 1000);
		return () => window.clearInterval(interval);
	}, []);

	// Group programs by date
	const programsByDate = useMemo(() => {
		if (!channelId) return new Map<string, EPGProgram[]>();

		const programs = epgData[channelId];
		if (!programs || programs.length === 0) return new Map<string, EPGProgram[]>();

		// Group all available programs by date (no date range filtering)
		const grouped = new Map<string, EPGProgram[]>();
		programs.forEach((program) => {
			const dateKey = new Date(
				program.start.getFullYear(),
				program.start.getMonth(),
				program.start.getDate(),
			).toISOString();
			const existing = grouped.get(dateKey) || [];
			existing.push(program);
			grouped.set(dateKey, existing);
		});

		return grouped;
	}, [channelId, epgData]);

	const channelPrograms = useMemo(() => {
		if (!channelId) return [];
		const programs = epgData[channelId];
		if (!programs || programs.length === 0) return [];
		// Return all available programs (no date range filtering)
		return programs;
	}, [channelId, epgData]);

	// Auto-scroll to center current/playing program when it changes or channel changes
	useLayoutEffect(() => {
		window.setTimeout(() => {
			nextScrollBehaviorRef.current = "smooth";
		}, 0);

		if (!currentPlayingProgram || !channelId || !channelPrograms.length) return;
		if (nextScrollBehaviorRef.current === "skip") return;

		currentProgramRef.current?.scrollIntoView({
			behavior: nextScrollBehaviorRef.current,
			block: "center",
		});
	}, [currentPlayingProgram, channelId, channelPrograms]);

	const handleProgramClick = useCallback(
		(programStart: Date, programEnd: Date) => {
			nextScrollBehaviorRef.current = "skip";
			onProgramSelect(programStart, programEnd);
		},
		[onProgramSelect],
	);

	const formatTime = (date: Date) => {
		return date.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const formatDuration = (start: Date, end: Date) => {
		const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
		return `${minutes}${t("minutes")}`;
	};

	const formatRelativeDate = (date: Date) => {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const daysDiff = Math.floor((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

		switch (daysDiff) {
			case 0:
				return t("today");
			case -1:
				return t("yesterday");
			case -2:
				return t("dayBeforeYesterday");
			case 1:
				return t("tomorrow");
			default:
				return date.toLocaleDateString(locale === "zh-Hans" || locale === "zh-Hant" ? "zh-CN" : "en-US", {
					month: "short",
					day: "numeric",
				});
		}
	};

	const isOnAir = (program: EPGProgram) => {
		return program.start <= currentTime && program.end > currentTime;
	};

	const isPastProgram = (program: EPGProgram) => {
		return program.end <= currentTime;
	};

	const formatDeclaredCatchupLength = (seconds: number) => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);

		if (locale === "zh-Hans" || locale === "zh-Hant") {
			if (hours > 0 && minutes > 0) return `${hours}小时${minutes}分钟`;
			if (hours > 0) return `${hours}小时`;
			return `${minutes}分钟`;
		}

		if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
		if (hours > 0) return `${hours}h`;
		return `${minutes}m`;
	};

	const isRecentCatchupBlocked = (program: EPGProgram) => {
		if (catchupRecentBlockHours <= 0) return false;
		return (
			isPastProgram(program) &&
			program.end.getTime() > currentTime.getTime() - catchupRecentBlockHours * 60 * 60 * 1000
		);
	};

	const isCurrentlyPlaying = (program: EPGProgram) => {
		return currentPlayingProgram?.id === program.id;
	};

	if (!channelId || channelPrograms.length === 0) {
		return <div className="flex h-full items-center justify-center text-muted-foreground">{t("noEpgAvailable")}</div>;
	}

	return (
		<div className="h-full overflow-y-auto pb-[env(safe-area-inset-bottom)]">
			{supportsCatchup && (catchupRecentBlockHours > 0 || (declaredCatchupLengthSeconds ?? 0) > 0) && (
				<div className="mx-2 mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
					{catchupRecentBlockHours > 0 && <div>{t("catchupRecentWindowNotice")}</div>}
					{declaredCatchupLengthSeconds && declaredCatchupLengthSeconds > 0 && (
						<div className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-200/80">
							{t("catchupDeclaredWindow")}: {formatDeclaredCatchupLength(declaredCatchupLengthSeconds)}
						</div>
					)}
				</div>
			)}
			<div className="relative">
				{Array.from(programsByDate.entries()).map(([dateKey, programs]) => {
					const date = new Date(dateKey);
					return (
						<div key={dateKey} className="relative">
							{/* Date Header */}
							<div className="sticky top-0 z-10 border-b border-border bg-card px-3 md:px-4 py-1.5 md:py-2 shadow-sm">
								<h3 className="text-xs md:text-sm font-semibold text-foreground">{formatRelativeDate(date)}</h3>
							</div>

							{/* Programs for this date */}
							<div className="px-2 py-2">
								<div className="space-y-2">
									{programs.map((program) => {
										const onAir = isOnAir(program);
										const isPast = isPastProgram(program);
										const playing = isCurrentlyPlaying(program);
										const recentCatchupBlocked = isRecentCatchupBlocked(program);
										const canReplay = isPast && supportsCatchup && !recentCatchupBlocked;
										const canGoLive = onAir;
										const isInteractive = canReplay || canGoLive;
										const title = recentCatchupBlocked
											? t("catchupRecentProgramBlocked")
											: canReplay
												? t("replay")
												: canGoLive
													? t("onAir")
													: undefined;

										return (
											<button
												type="button"
												key={program.id}
												ref={playing ? currentProgramRef : null}
												disabled={!isInteractive}
												title={title}
												aria-disabled={!isInteractive}
												className={clsx(
													"rounded-xl border bg-card text-card-foreground shadow overflow-hidden transition duration-200 w-full text-left",
													playing
														? "border-primary bg-primary/5 shadow-md"
														: recentCatchupBlocked
															? "border-border border-dashed opacity-45"
															: isPast
															? "border-border opacity-70"
															: "border-border",
													isInteractive &&
														"cursor-pointer hover:border-primary/50 hover:bg-muted/50 hover:opacity-100 hover:shadow-sm",
													!isInteractive && "cursor-not-allowed",
												)}
												onClick={() => {
													if (canReplay) {
														handleProgramClick(program.start, program.end);
													} else if (canGoLive) {
														// Click on-air program to go live
														const now = new Date();
														handleProgramClick(now, now);
													}
												}}
											>
												<div className="flex items-center gap-2 md:gap-2.5 p-2 md:p-2.5">
													{/* Left: Status Indicator Bar */}
													<div className="flex shrink-0">
														{playing ? (
															<div className="h-8 md:h-10 w-1 rounded-full bg-primary" title={t("nowPlaying")} />
														) : canReplay ? (
															<div
																className="h-8 md:h-10 w-1 rounded-full bg-muted-foreground/30"
																title={t("replay")}
															/>
														) : recentCatchupBlocked ? (
															<div
																className="h-8 md:h-10 w-1 rounded-full bg-amber-500/40"
																title={t("catchupRecentProgramBlocked")}
															/>
														) : (
															<div className="h-8 md:h-10 w-1 rounded-full bg-transparent" />
														)}
													</div>

													{/* Middle-Left: Time */}
													<div className="flex shrink-0 flex-col items-end">
														<span
															className={clsx(
																"text-xs md:text-sm font-semibold tabular-nums leading-tight",
																playing && "text-primary",
															)}
														>
															{formatTime(program.start)}
														</span>
														<span className="text-[10px] md:text-xs text-muted-foreground tabular-nums">
															{formatDuration(program.start, program.end)}
														</span>
													</div>

													{/* Middle-Right: Title and Description */}
													<div className="flex-1 overflow-hidden min-w-0">
														<div className="text-sm md:text-base font-semibold leading-tight">
															{program.title || t("excellentProgram")}
														</div>
													</div>

													{/* Right: Status Icon (unified position) */}
													<div className="flex h-8 md:h-10 w-3 md:w-4 shrink-0 items-center justify-center">
														{onAir && (
															<span title={t("onAir")}>
																<Circle className="h-2.5 w-2.5 md:h-3 md:w-3 text-primary fill-current" />
															</span>
														)}
														{canReplay && (
															<span title={t("replay")}>
																<History className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground" />
															</span>
														)}
														{recentCatchupBlocked && (
															<span title={t("catchupRecentProgramBlocked")}>
																<History className="h-3 w-3 md:h-3.5 md:w-3.5 text-amber-600/70" />
															</span>
														)}
													</div>
												</div>
											</button>
										);
									})}
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export const EPGView = memo(EPGViewComponent);
