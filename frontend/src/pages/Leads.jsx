import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, Search, Plus, ArrowRight } from "lucide-react";

const LEAD_STATUSES = { New: "bg-blue-500/15 text-blue-700", Contacted: "bg-yellow-500/15 text-yellow-700", Qualified: "bg-emerald-500/15 text-emerald-700", Lost: "bg-red-500/15 text-red-700" };

const mockLeads = [
    { id: "LD-001", name: "George Chen", source: "Website", status: "New", interest: "Group Wine Tasting", created: "Today" },
    { id: "LD-002", name: "Hannah Kim", source: "Referral", status: "Contacted", interest: "Corporate Event", created: "Yesterday" },
    { id: "LD-003", name: "Ivan Smirnov", source: "Phone", status: "Qualified", interest: "VIP Private Tour", created: "3 days ago" },
    { id: "LD-004", name: "Julia Costa", source: "Email", status: "New", interest: "Family Package", created: "Today" },
    { id: "LD-005", name: "Karl Muller", source: "Walk-in", status: "Lost", interest: "Weekend Special", created: "1 week ago" },
    { id: "LD-006", name: "Leila Mahmoud", source: "Social", status: "Contacted", interest: "Cheese Making Class", created: "2 days ago" },
];

export default function Leads() {
    const [searchTerm, setSearchTerm] = useState("");
    const filtered = mockLeads.filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><UserPlus className="w-6 h-6 text-cheese-600" /> Leads</h1>
                    <p className="text-sm text-muted-foreground mt-1">{filtered.length} leads</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9"><Plus className="w-4 h-4 mr-1" /> Add Lead</Button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((lead) => (
                    <motion.div key={lead.id} whileHover={{ y: -3 }}>
                        <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-all">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700">{lead.name.charAt(0)}</div>
                                        <div><h3 className="font-semibold text-gray-900">{lead.name}</h3><span className="text-xs text-muted-foreground">{lead.id}</span></div>
                                    </div>
                                    <Badge className={LEAD_STATUSES[lead.status]}>{lead.status}</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mb-1">Interest: <span className="font-medium text-gray-700">{lead.interest}</span></p>
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-xs text-muted-foreground">
                                    <span>Source: {lead.source}</span><span>{lead.created}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
