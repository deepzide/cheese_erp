import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Search, Plus, DollarSign, Eye } from "lucide-react";

const QT_STATUS = { Draft: "bg-gray-500/15 text-gray-600", Sent: "bg-blue-500/15 text-blue-700", Accepted: "bg-emerald-500/15 text-emerald-700", Rejected: "bg-red-500/15 text-red-700" };

const mockQuotations = [
    { id: "QT-001", contact: "George Chen", route: "Golden Route", total: 1500, party_size: 6, status: "Draft", date: "Today" },
    { id: "QT-002", contact: "Hannah Kim", route: "Premium Experience", total: 4500, party_size: 10, status: "Sent", date: "Yesterday" },
    { id: "QT-003", contact: "Ivan Smirnov", route: "VIP Cave Tour", total: 960, party_size: 8, status: "Accepted", date: "3 days ago" },
    { id: "QT-004", contact: "Julia Costa", route: "Family Fun", total: 640, party_size: 8, status: "Draft", date: "Today" },
    { id: "QT-005", contact: "Karl Muller", route: "Classic Tour", total: 360, party_size: 3, status: "Rejected", date: "1 week ago" },
];

export default function Quotations() {
    const [searchTerm, setSearchTerm] = useState("");
    const filtered = mockQuotations.filter(q => q.contact.toLowerCase().includes(searchTerm.toLowerCase()) || q.id.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FileText className="w-6 h-6 text-cheese-600" /> Quotations</h1>
                    <p className="text-sm text-muted-foreground mt-1">{filtered.length} quotations</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9"><Plus className="w-4 h-4 mr-1" /> New Quote</Button>
                </div>
            </div>
            <div className="space-y-3">
                {filtered.map((qt) => (
                    <motion.div key={qt.id} whileHover={{ x: 4 }}>
                        <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-all">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-cheese-100 flex items-center justify-center"><FileText className="w-5 h-5 text-cheese-700" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2"><h3 className="font-semibold text-sm">{qt.contact}</h3><span className="text-xs font-mono text-muted-foreground">{qt.id}</span></div>
                                    <p className="text-xs text-muted-foreground">{qt.route} • {qt.party_size} guests</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg text-gray-900 flex items-center"><DollarSign className="w-4 h-4" />{qt.total.toLocaleString()}</p>
                                    <Badge className={QT_STATUS[qt.status]}>{qt.status}</Badge>
                                </div>
                                <span className="text-xs text-muted-foreground hidden sm:block">{qt.date}</span>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="w-4 h-4" /></Button>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
