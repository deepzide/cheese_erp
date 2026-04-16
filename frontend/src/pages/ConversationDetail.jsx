import React, { useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFrappeDoc, useFrappeList } from "@/lib/useApiData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, ArrowLeft, User, Bot, Ticket, ShoppingCart, ExternalLink } from "lucide-react";

const CHANNEL_BADGE = {
    WHATSAPP: "bg-green-500/15 text-green-700",
    WEB: "bg-blue-500/15 text-blue-700",
    AGENT: "bg-purple-500/15 text-purple-700",
    PHONE: "bg-orange-500/15 text-orange-700",
};

export default function ConversationDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const messagesEndRef = useRef(null);

    const { data: convo, isLoading: convoLoading } = useFrappeDoc("Conversation", id);

    const { data: messages = [], isLoading: msgsLoading } = useFrappeList("Cheese Message", {
        filters: { conversation: id },
        fields: ["name", "role", "content", "timestamp", "message_order"],
        pageSize: 500,
        orderBy: "message_order asc",
        enabled: !!id,
    });

    useEffect(() => {
        if (messages.length > 0) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const stripHtml = (html) => {
        if (!html) return "";
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
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
                                <ExternalLink className="w-3.5 h-3.5 mr-1" /> Transcript
                            </Button>
                        )}
                    </div>
                </div>
                {convo?.summary && (
                    <p className="text-sm text-muted-foreground mt-2 ml-12">{convo.summary}</p>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgsLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                            <Skeleton className="h-12 w-64 rounded-2xl" />
                        </div>
                    ))
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <MessageSquare className="w-16 h-16 opacity-20 mb-4" />
                        {convo?.summary ? (
                            <div className="max-w-lg text-center space-y-4">
                                <p className="text-sm font-medium text-foreground">Conversation Summary</p>
                                <div className="text-sm text-left bg-muted/30 rounded-lg p-4" dangerouslySetInnerHTML={{ __html: convo.summary }} />
                                {convo?.highlights_json && (() => {
                                    try {
                                        const highlights = JSON.parse(convo.highlights_json);
                                        if (Array.isArray(highlights) && highlights.length > 0) {
                                            return (
                                                <div className="text-left space-y-2">
                                                    <p className="text-xs font-semibold text-muted-foreground uppercase">Highlights</p>
                                                    <ul className="text-sm space-y-1 list-disc list-inside">
                                                        {highlights.map((h, i) => <li key={i}>{typeof h === "string" ? h : JSON.stringify(h)}</li>)}
                                                    </ul>
                                                </div>
                                            );
                                        }
                                    } catch { return null; }
                                    return null;
                                })()}
                            </div>
                        ) : (
                            <>
                                <p>No messages in this conversation</p>
                                {convo?.transcript_url && (
                                    <Button variant="link" className="mt-2" onClick={() => window.open(convo.transcript_url, "_blank")}>
                                        View external transcript
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isUser = msg.role === "user";
                        return (
                            <div key={msg.name} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                                <div className={`flex items-end gap-2 max-w-[75%] ${isUser ? "flex-row-reverse" : ""}`}>
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isUser ? "bg-cheese-100 dark:bg-cheese-900/30" : "bg-blue-100 dark:bg-blue-900/30"}`}>
                                        {isUser ? <User className="w-3.5 h-3.5 text-cheese-700 dark:text-cheese-400" /> : <Bot className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />}
                                    </div>
                                    <div>
                                        <Card className={`border-0 shadow-sm ${isUser ? "bg-cheese-500/10" : "bg-muted"}`}>
                                            <CardContent className="p-3">
                                                <p className="text-sm whitespace-pre-wrap">{stripHtml(msg.content)}</p>
                                            </CardContent>
                                        </Card>
                                        <p className="text-[10px] text-muted-foreground mt-1 px-1">
                                            {msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ""}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
