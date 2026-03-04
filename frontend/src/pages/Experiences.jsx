import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Search, Plus, Clock, Users, DollarSign, Calendar, Settings, Eye, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0 } };

const initialExperiences = [
    { id: "EXP-001", name: "Wine Tasting Tour", status: "ONLINE", description: "Guided tour of our finest wine selections", individual_price: 45, route_price: 35, capacity: 20, booked_today: 14, slots_today: 4, duration: "1.5 hrs" },
    { id: "EXP-002", name: "Cheese Factory Visit", status: "ONLINE", description: "Behind-the-scenes look at artisanal cheese making", individual_price: 35, route_price: 25, capacity: 25, booked_today: 18, slots_today: 3, duration: "2 hrs" },
    { id: "EXP-003", name: "Gourmet Lunch", status: "ONLINE", description: "Farm-to-table dining with cheese pairings", individual_price: 85, route_price: 70, capacity: 30, booked_today: 22, slots_today: 2, duration: "1.5 hrs" },
    { id: "EXP-004", name: "Artisan Workshop", status: "ONLINE", description: "Hands-on cheese and bread making class", individual_price: 55, route_price: 40, capacity: 12, booked_today: 5, slots_today: 3, duration: "2.5 hrs" },
    { id: "EXP-005", name: "Sunset Walk", status: "OFFLINE", description: "Evening stroll through picturesque vineyards", individual_price: 30, route_price: 20, capacity: 40, booked_today: 0, slots_today: 0, duration: "1 hr" },
    { id: "EXP-006", name: "VIP Cave Tour", status: "ONLINE", description: "Exclusive access to aging caves", individual_price: 120, route_price: 95, capacity: 8, booked_today: 6, slots_today: 2, duration: "2 hrs" },
];

const mockSlots = [
    { id: "SL-001", time: "09:00", max_capacity: 15, booked: 12, status: "OPEN" },
    { id: "SL-002", time: "10:30", max_capacity: 15, booked: 15, status: "CLOSED" },
    { id: "SL-003", time: "12:00", max_capacity: 20, booked: 8, status: "OPEN" },
    { id: "SL-004", time: "14:00", max_capacity: 15, booked: 0, status: "OPEN" },
    { id: "SL-005", time: "16:00", max_capacity: 10, booked: 10, status: "BLOCKED" },
];

const emptyForm = { name: "", description: "", individual_price: "", route_price: "", capacity: "", duration: "" };

export default function Experiences() {
    const [experiences, setExperiences] = useState(initialExperiences);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedExp, setSelectedExp] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);

    const filtered = experiences.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleCreate = () => {
        if (!form.name || !form.individual_price) {
            toast.error("Name and individual price are required");
            return;
        }
        const newExp = {
            id: `EXP-${String(experiences.length + 1).padStart(3, '0')}`,
            name: form.name,
            description: form.description,
            status: "OFFLINE",
            individual_price: parseInt(form.individual_price),
            route_price: parseInt(form.route_price) || 0,
            capacity: parseInt(form.capacity) || 20,
            booked_today: 0,
            slots_today: 0,
            duration: form.duration || "1 hr",
        };
        setExperiences(prev => [newExp, ...prev]);
        setForm(emptyForm);
        setCreateOpen(false);
        toast.success(`Experience "${newExp.name}" created`);
    };

    return (
        <motion.div variants={container} initial="hidden" animate="show" className="p-6 space-y-6">
            <motion.div variants={item} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-cheese-600" /> Experiences
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{filtered.length} experiences</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-56 h-9" />
                    </div>
                    <Button className="cheese-gradient text-black font-semibold border-0 h-9" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> New</Button>
                </div>
            </motion.div>

            <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((exp) => (
                    <motion.div key={exp.id} whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
                        <Card className="border border-border shadow-sm hover:shadow-lg transition-all group overflow-hidden">
                            <div className={`h-1.5 ${exp.status === 'ONLINE' ? 'cheese-gradient' : 'bg-muted-foreground/30'}`} />
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant={exp.status === 'ONLINE' ? 'default' : 'secondary'} className="text-[10px]">{exp.status}</Badge>
                                            <span className="text-xs font-mono text-muted-foreground">{exp.id}</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground">{exp.name}</h3>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem><Settings className="w-3 h-3 mr-2" /> Edit</DropdownMenuItem>
                                            <DropdownMenuItem><Calendar className="w-3 h-3 mr-2" /> Slots</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{exp.description}</p>
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                    <div className="text-center bg-muted rounded-lg p-2">
                                        <Clock className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-1" /><p className="text-xs font-semibold">{exp.duration}</p>
                                    </div>
                                    <div className="text-center bg-muted rounded-lg p-2">
                                        <Users className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-1" /><p className="text-xs font-semibold">{exp.capacity}</p>
                                    </div>
                                    <div className="text-center bg-muted rounded-lg p-2">
                                        <Calendar className="w-3.5 h-3.5 text-muted-foreground mx-auto mb-1" /><p className="text-xs font-semibold">{exp.slots_today}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-3 border-t border-border">
                                    <div className="flex gap-3">
                                        <div><p className="text-[10px] text-muted-foreground">Individual</p><p className="font-bold text-sm text-cheese-700 dark:text-cheese-400">${exp.individual_price}</p></div>
                                        <div><p className="text-[10px] text-muted-foreground">Route</p><p className="font-bold text-sm text-muted-foreground">${exp.route_price}</p></div>
                                    </div>
                                    <Button variant="ghost" size="sm" className="text-cheese-600 h-7 text-xs" onClick={() => { setSelectedExp(exp); setDetailOpen(true); }}>
                                        <Eye className="w-3 h-3 mr-1" /> View
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </motion.div>

            {/* Create Experience Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-cheese-600" /> Create Experience</DialogTitle>
                        <DialogDescription>Add a new experience to your catalog</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Experience Name *</Label>
                            <Input placeholder="e.g. Wine Tasting Tour" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea placeholder="What makes this experience special..." value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Individual Price ($) *</Label>
                                <Input type="number" min="0" placeholder="45" value={form.individual_price} onChange={(e) => setForm(f => ({ ...f, individual_price: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Route Price ($)</Label>
                                <Input type="number" min="0" placeholder="35" value={form.route_price} onChange={(e) => setForm(f => ({ ...f, route_price: e.target.value }))} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Capacity</Label>
                                <Input type="number" min="1" placeholder="20" value={form.capacity} onChange={(e) => setForm(f => ({ ...f, capacity: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Duration</Label>
                                <Select value={form.duration} onValueChange={(v) => setForm(f => ({ ...f, duration: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                        {["30 min", "1 hr", "1.5 hrs", "2 hrs", "2.5 hrs", "3 hrs", "Half day", "Full day"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="cheese-gradient text-black font-semibold border-0" onClick={handleCreate}>
                            <Plus className="w-4 h-4 mr-1" /> Create
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Detail Dialog */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-cheese-600" /> {selectedExp?.name}</DialogTitle>
                        <DialogDescription>{selectedExp?.description}</DialogDescription>
                    </DialogHeader>
                    {selectedExp && (
                        <Tabs defaultValue="slots" className="mt-2">
                            <TabsList className="w-full"><TabsTrigger value="slots" className="flex-1">Slots</TabsTrigger><TabsTrigger value="pricing" className="flex-1">Pricing</TabsTrigger><TabsTrigger value="policy" className="flex-1">Policy</TabsTrigger></TabsList>
                            <TabsContent value="slots" className="space-y-2 mt-4">
                                {mockSlots.map((slot) => {
                                    const occ = Math.round((slot.booked / slot.max_capacity) * 100);
                                    return (
                                        <div key={slot.id} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                                            <span className="font-mono font-bold text-sm w-12">{slot.time}</span>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between text-xs mb-1">
                                                    <span>{slot.booked}/{slot.max_capacity}</span>
                                                    <Badge variant={slot.status === 'OPEN' ? 'default' : 'destructive'} className="text-[10px]">{slot.status}</Badge>
                                                </div>
                                                <div className="w-full bg-muted-foreground/20 rounded-full h-1.5">
                                                    <div className={`h-1.5 rounded-full ${occ >= 90 ? 'bg-red-500' : occ >= 60 ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{ width: `${occ}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </TabsContent>
                            <TabsContent value="pricing" className="mt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-cheese-50 dark:bg-cheese-900/20 rounded-xl p-4 border border-cheese-200 dark:border-cheese-800"><p className="text-xs text-cheese-600 dark:text-cheese-400">Individual</p><p className="text-2xl font-bold text-cheese-800 dark:text-cheese-300">${selectedExp.individual_price}</p></div>
                                    <div className="bg-muted rounded-xl p-4 border border-border"><p className="text-xs text-muted-foreground">Route</p><p className="text-2xl font-bold text-foreground">${selectedExp.route_price}</p></div>
                                </div>
                            </TabsContent>
                            <TabsContent value="policy" className="mt-4 space-y-3">
                                {[{ label: "Cancel until", value: "24h before" }, { label: "Modify until", value: "12h before" }, { label: "Min advance", value: "2 hours" }].map((p) => (
                                    <div key={p.label} className="flex items-center justify-between bg-muted rounded-lg p-3"><span className="text-sm text-muted-foreground">{p.label}</span><span className="text-sm font-medium">{p.value}</span></div>
                                ))}
                            </TabsContent>
                        </Tabs>
                    )}
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
