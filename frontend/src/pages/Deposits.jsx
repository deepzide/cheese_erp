import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet, Search, DollarSign, CheckCircle, Clock, AlertCircle } from "lucide-react";

const DEP_STATUS = { Pending: "bg-yellow-500/15 text-yellow-700", Paid: "bg-emerald-500/15 text-emerald-700", Overdue: "bg-red-500/15 text-red-700", Refunded: "bg-blue-500/15 text-blue-700" };

const mockDeposits = [
    { id: "DEP-001", contact: "Alice Johnson", booking: "BK-001", amount: 50, status: "Pending", due: "In 24 hours", route: "Golden Route" },
    { id: "DEP-002", contact: "Bob Smith", booking: "BK-002", amount: 75, status: "Paid", due: "Completed", route: "Premium Experience" },
    { id: "DEP-003", contact: "Carlos Rivera", booking: "BK-003", amount: 45, status: "Overdue", due: "2 hours ago", route: "Golden Route" },
    { id: "DEP-004", contact: "Diana Lee", booking: "BK-004", amount: 120, status: "Paid", due: "Completed", route: "VIP Cave Tour" },
    { id: "DEP-005", contact: "Evgeny Petrov", booking: "BK-005", amount: 35, status: "Refunded", due: "Refunded", route: "Classic Tour" },
    { id: "DEP-006", contact: "Fatima Al-Rashid", booking: "BK-006", amount: 60, status: "Pending", due: "In 48 hours", route: "Premium Experience" },
];

export default function Deposits() {
    const [searchTerm, setSearchTerm] = useState("");
    const filtered = mockDeposits.filter(d => d.contact.toLowerCase().includes(searchTerm.toLowerCase()) || d.id.toLowerCase().includes(searchTerm.toLowerCase()));

    const StatusIcon = ({ status }) => {
        if (status === 'Paid') return <CheckCircle className="w-4 h-4 text-emerald-500" />;
        if (status === 'Overdue') return <AlertCircle className="w-4 h-4 text-red-500" />;
        return <Clock className="w-4 h-4 text-yellow-500" />;
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Wallet className="w-6 h-6 text-cheese-600" /> Deposits</h1>
                    <p className="text-sm text-muted-foreground mt-1">{filtered.length} deposits tracked</p>
                </div>
                <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" /></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[{ label: "Pending", value: `$${mockDeposits.filter(d => d.status === 'Pending').reduce((a, b) => a + b.amount, 0)}`, color: "from-yellow-500 to-amber-500", count: mockDeposits.filter(d => d.status === 'Pending').length },
                { label: "Collected", value: `$${mockDeposits.filter(d => d.status === 'Paid').reduce((a, b) => a + b.amount, 0)}`, color: "from-emerald-500 to-green-600", count: mockDeposits.filter(d => d.status === 'Paid').length },
                { label: "Overdue", value: `$${mockDeposits.filter(d => d.status === 'Overdue').reduce((a, b) => a + b.amount, 0)}`, color: "from-red-500 to-rose-600", count: mockDeposits.filter(d => d.status === 'Overdue').length },
                ].map((stat) => (
                    <Card key={stat.label} className="border-0 shadow-lg overflow-hidden">
                        <div className={`bg-gradient-to-br ${stat.color} p-4 text-white`}>
                            <p className="text-sm opacity-80">{stat.label}</p>
                            <p className="text-2xl font-bold mt-1">{stat.value}</p>
                            <p className="text-xs opacity-70 mt-1">{stat.count} deposits</p>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="space-y-3">
                {filtered.map((dep) => (
                    <motion.div key={dep.id} whileHover={{ x: 4 }}>
                        <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-all">
                            <CardContent className="p-4 flex items-center gap-4">
                                <StatusIcon status={dep.status} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2"><h3 className="font-semibold text-sm">{dep.contact}</h3><span className="text-xs font-mono text-muted-foreground">{dep.id}</span></div>
                                    <p className="text-xs text-muted-foreground">{dep.route} • {dep.booking}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg flex items-center"><DollarSign className="w-4 h-4" />{dep.amount}</p>
                                    <Badge className={DEP_STATUS[dep.status]}>{dep.status}</Badge>
                                </div>
                                <span className="text-xs text-muted-foreground hidden sm:block min-w-[80px] text-right">{dep.due}</span>
                                {dep.status === 'Pending' && <Button size="sm" className="cheese-gradient text-black border-0 h-8 text-xs">Verify</Button>}
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
