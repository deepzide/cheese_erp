import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Search, Plus, Phone, Mail, MoreHorizontal, Eye } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const mockContacts = [
    { id: "CT-001", name: "Alice Johnson", phone: "+1 555-1234", email: "alice@example.com", tickets: 5, last_visit: "2 days ago" },
    { id: "CT-002", name: "Bob Smith", phone: "+1 555-5678", email: "bob@example.com", tickets: 3, last_visit: "1 week ago" },
    { id: "CT-003", name: "Carlos Rivera", phone: "+1 555-9012", email: "carlos@example.com", tickets: 8, last_visit: "Yesterday" },
    { id: "CT-004", name: "Diana Lee", phone: "+1 555-3456", email: "diana@example.com", tickets: 1, last_visit: "3 weeks ago" },
    { id: "CT-005", name: "Evgeny Petrov", phone: "+44 20-7890", email: "evgeny@example.com", tickets: 12, last_visit: "Today" },
    { id: "CT-006", name: "Fatima Al-Rashid", phone: "+971 50-1234", email: "fatima@example.com", tickets: 2, last_visit: "5 days ago" },
];

export default function Contacts() {
    const [searchTerm, setSearchTerm] = useState("");
    const filtered = mockContacts.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm));

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users className="w-6 h-6 text-cheese-600" /> Contacts</h1>
                    <p className="text-sm text-muted-foreground mt-1">{filtered.length} contacts</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="Search contacts..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" />
                    </div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9"><Plus className="w-4 h-4 mr-1" /> Add</Button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((contact) => (
                    <motion.div key={contact.id} whileHover={{ y: -3 }}>
                        <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-cheese-100 flex items-center justify-center font-bold text-cheese-700">{contact.name.charAt(0)}</div>
                                        <div>
                                            <h3 className="font-semibold text-gray-900">{contact.name}</h3>
                                            <span className="text-xs text-muted-foreground">{contact.id}</span>
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem><Eye className="w-3 h-3 mr-2" /> View</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <p className="flex items-center gap-2 text-muted-foreground"><Phone className="w-3.5 h-3.5" /> {contact.phone}</p>
                                    <p className="flex items-center gap-2 text-muted-foreground"><Mail className="w-3.5 h-3.5" /> {contact.email}</p>
                                </div>
                                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                                    <Badge variant="outline" className="text-xs">{contact.tickets} tickets</Badge>
                                    <span className="text-xs text-muted-foreground">Last: {contact.last_visit}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
