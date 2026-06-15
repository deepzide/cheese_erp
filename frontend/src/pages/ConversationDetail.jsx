import React, { useMemo, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useFrappeDoc } from "@/lib/useApiData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, ArrowLeft, User, Bot, Ticket, ShoppingCart, ExternalLink, CheckCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/api/client";

const MESSAGE_PAGE_SIZE = 1000;

const CHANNEL_BADGE = {
    WHATSAPP: "bg-green-500/15 text-green-700",
    WEB: "bg-blue-500/15 text-blue-700",
    AGENT: "bg-purple-500/15 text-purple-700",
    PHONE: "bg-orange-500/15 text-orange-700",
};

const getDayKey = (value) => {
    if (!value) return "unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "unknown";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const isSameDay = (dateA, dateB) => {
    if (!dateA || !dateB) return false;
    return (
        dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth() &&
        dateA.getDate() === dateB.getDate()
    );
};

const messageSortKey = (a, b) => {
    const timeA = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return (a?.message_order || 0) - (b?.message_order || 0);
};

/** Admin sees every company's transcript upload; show one bubble per logical message. */
const dedupeConversationMessages = (messages) => {
    const byKey = new Map();
    for (const msg of messages) {
        const key = `${msg.message_order}|${msg.role}|${msg.content}`;
        const existing = byKey.get(key);
        if (!existing || (!existing.company && msg.company)) {
            byKey.set(key, msg);
        }
    }
    return Array.from(byKey.values()).sort(messageSortKey);
};

export default function ConversationDetail() {
    const { t } = useTranslation();
    const { id } = useParams();
    const navigate = useNavigate();
    const messagesEndRef = useRef(null);
    const containerRef = useRef(null);
    const didInitialScrollRef = useRef(false);
    const stickToBottomRef = useRef(true);

    const { data: convo, isLoading: convoLoading } = useFrappeDoc("Conversation", id);

    const {
        data: pages,
        isLoading: msgsLoading,
        isError: msgsError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ["conversation-messages", id],
        enabled: !!id,
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => {
            const params = new URLSearchParams();
            params.append("order_by", "timestamp asc, message_order asc");
            params.append("limit_page_length", MESSAGE_PAGE_SIZE);
            params.append("limit_start", String(pageParam));
            params.append("fields", JSON.stringify(["name", "role", "content", "timestamp", "message_order", "company"]));
            params.append("filters", JSON.stringify([["Cheese Message", "conversation", "=", id]]));
            const result = await apiRequest(`/api/resource/Cheese%20Message?${params.toString()}`);
            const payload = result?.data?.message || result?.data || result;
            return payload?.data || payload || [];
        },
        getNextPageParam: (lastPage, allPages) => {
            if (!Array.isArray(lastPage) || lastPage.length < MESSAGE_PAGE_SIZE) return undefined;
            return allPages.length * MESSAGE_PAGE_SIZE;
        },
    });

    useEffect(() => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const messages = useMemo(() => {
        const flat = (pages?.pages || []).flatMap((page) => (Array.isArray(page) ? page : []));
        return dedupeConversationMessages(flat);
    }, [pages]);

    useEffect(() => {
        if (!messages.length) return;
        if (!didInitialScrollRef.current || stickToBottomRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            didInitialScrollRef.current = true;
        }
    }, [messages]);

    const stripHtml = (html) => {
        if (!html) return "";
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    };

    const formatSeparatorLabel = (timestamp) => {
        if (!timestamp) return t("conversation.unknownDate", "Unknown date");
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return t("conversation.unknownDate", "Unknown date");
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (isSameDay(date, today)) return t("conversation.today", "Today");
        if (isSameDay(date, yesterday)) return t("conversation.yesterday", "Yesterday");
        return date.toLocaleDateString();
    };

    const onScrollMessages = (event) => {
        const target = event.currentTarget;
        const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
        stickToBottomRef.current = distanceFromBottom < 120;
    };

    return (
        <div className="flex flex-col h-full">
            <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate("/cheese/conversations")}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex-1 min-w-0">
                        {convoLoading ? (
                            <Skeleton className="h-5 w-48" />
                        ) : (
                            <>
                                <h1 className="text-lg font-semibold flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5 text-cheese-600" />
                                    {convo?.contact || id}
                                </h1>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge className={CHANNEL_BADGE[convo?.channel] || CHANNEL_BADGE.WEB}>
                                        {convo?.channel || "—"}
                                    </Badge>
                                    <Badge variant="outline">{convo?.status || "—"}</Badge>
                                    <span className="text-xs text-muted-foreground">{id}</span>
                                </div>
                            </>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {convo?.ticket && (
                            <Button variant="outline" size="sm" onClick={() => navigate(`/cheese/tickets/${convo.ticket}`)}>
                                <Ticket className="w-3.5 h-3.5 mr-1" /> {convo.ticket}
                            </Button>
                        )}
                        {convo?.route_booking && (
                            <Button variant="outline" size="sm" onClick={() => navigate(`/cheese/bookings/${convo.route_booking}`)}>
                                <ShoppingCart className="w-3.5 h-3.5 mr-1" /> {convo.route_booking}
                            </Button>
                        )}
                        {convo?.transcript_url && (
                            <Button variant="outline" size="sm" onClick={() => window.open(convo.transcript_url, "_blank")}>
                                <ExternalLink className="w-3.5 h-3.5 mr-1" /> {t("conversation.transcript", "Transcript")}
                            </Button>
                        )}
                    </div>
                </div>
                {convo?.summary && (
                    <p className="text-sm text-muted-foreground mt-2 ml-12">{convo.summary}</p>
                )}
            </div>

            <div ref={containerRef} onScroll={onScrollMessages} className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                    {msgsLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                                <Skeleton className="h-12 w-64 rounded-2xl" />
                            </div>
                        ))
                    ) : msgsError ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <MessageSquare className="w-16 h-16 opacity-20 mb-4" />
                            <p>{t("conversation.loadFailed", "Failed to load conversation messages")}</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <MessageSquare className="w-16 h-16 opacity-20 mb-4" />
                            {convo?.summary ? (
                                <div className="max-w-lg text-center space-y-4">
                                    <p className="text-sm font-medium text-foreground">{t("conversation.summaryTitle", "Conversation Summary")}</p>
                                    <div className="text-sm text-left bg-muted/30 rounded-lg p-4" dangerouslySetInnerHTML={{ __html: convo.summary }} />
                                    {convo?.highlights_json && (() => {
                                        try {
                                            const highlights = JSON.parse(convo.highlights_json);
                                            if (Array.isArray(highlights) && highlights.length > 0) {
                                                return (
                                                    <div className="text-left space-y-2">
                                                        <p className="text-xs font-semibold text-muted-foreground uppercase">
                                                            {t("conversation.highlights", "Highlights")}
                                                        </p>
                                                        <ul className="text-sm space-y-1 list-disc list-inside">
                                                            {highlights.map((h, i) => <li key={i}>{typeof h === "string" ? h : JSON.stringify(h)}</li>)}
                                                        </ul>
                                                    </div>
                                                );
                                            }
                                        } catch {
                                            return null;
                                        }
                                        return null;
                                    })()}
                                </div>
                            ) : (
                                <>
                                    <p>{t("conversation.noMessages", "No messages in this conversation")}</p>
                                    {convo?.transcript_url && (
                                        <Button variant="link" className="mt-2" onClick={() => window.open(convo.transcript_url, "_blank")}>
                                            {t("conversation.viewTranscript", "View external transcript")}
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        messages.map((msg, idx) => {
                            const isUser = msg.role === "user";
                            const prevMsg = idx > 0 ? messages[idx - 1] : null;
                            const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
                            const showSeparator = !prevMsg || getDayKey(prevMsg?.timestamp) !== getDayKey(msg?.timestamp);
                            const showAvatar = !prevMsg || prevMsg.role !== msg.role;
                            const isLastInCluster = !nextMsg || nextMsg.role !== msg.role;
                            const timeLabel = msg.timestamp
                                ? new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                : "";
                            const fullTimestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : "";

                            return (
                                <React.Fragment key={msg.name}>
                                    {showSeparator && (
                                        <div className="flex items-center justify-center py-2">
                                            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-full">
                                                {formatSeparatorLabel(msg.timestamp)}
                                            </span>
                                        </div>
                                    )}
                                    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                                        <div className={`flex items-end gap-2 max-w-[75%] ${isUser ? "flex-row-reverse" : ""}`}>
                                            {showAvatar ? (
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isUser ? "bg-cheese-100 dark:bg-cheese-900/30" : "bg-blue-100 dark:bg-blue-900/30"}`}>
                                                    {isUser ? <User className="w-3.5 h-3.5 text-cheese-700 dark:text-cheese-400" /> : <Bot className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />}
                                                </div>
                                            ) : (
                                                <div className="w-7 shrink-0" />
                                            )}
                                            <div>
                                                <Card
                                                    className={`border-0 shadow-sm ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"} rounded-2xl ${
                                                        isUser
                                                            ? isLastInCluster ? "rounded-br-sm" : ""
                                                            : isLastInCluster ? "rounded-bl-sm" : ""
                                                    }`}
                                                >
                                                    <CardContent className="p-3">
                                                        <p className="text-sm whitespace-pre-wrap">{stripHtml(msg.content)}</p>
                                                    </CardContent>
                                                </Card>
                                                <div className={`text-[10px] text-muted-foreground mt-1 px-1 flex items-center gap-1 ${isUser ? "justify-end" : "justify-start"}`}>
                                                    <span title={fullTimestamp}>{timeLabel}</span>
                                                    {isUser && (
                                                        <span className="inline-flex items-center gap-0.5" title={t("conversation.sent", "Sent")}>
                                                            <CheckCheck className="w-3 h-3" />
                                                            <span>{t("conversation.sent", "Sent")}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })
                    )}
                    {isFetchingNextPage && (
                        <div className="flex items-center justify-center py-3">
                            <span className="text-xs text-muted-foreground">{t("conversation.loadingMore", "Loading more messages...")}</span>
                        </div>
                    )}
                </div>
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
