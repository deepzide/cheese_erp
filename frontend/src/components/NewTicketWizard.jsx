import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Ticket as TicketIcon, BedDouble, Map } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import CompanySelect from "@/components/CompanySelect";
import { useActiveEstablishment } from "@/lib/ActiveEstablishmentContext";
import { useFrappeCreate } from "@/lib/useApiData";
import { bookingService } from "@/api/bookingService";
import { apiRequest } from "@/api/client";

const TYPES = [
    { key: "ACTIVITY", labelKey: "ticketWizard.activity", label: "Actividad", icon: TicketIcon },
    { key: "HOTEL", labelKey: "ticketWizard.room", label: "Habitación", icon: BedDouble },
    { key: "ROUTE", labelKey: "ticketWizard.package", label: "Paquete", icon: Map },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
    type: "ACTIVITY",
    company: "",
    experience: "",
    slot: "",
    route: "",
    selected_date: "",
    check_in_date: "",
    check_out_date: "",
    date_to: "",
    party_size: "2",
    rooms_requested: "1",
    contact: "",
    newClientName: "",
    newClientPhone: "",
    clientMode: "existing",
    status: "PENDING",
    notes: "",
};

/**
 * Alta manual unificada (mockup Viventi §7.2, E4-4): un modal con selector de
 * tipo — Actividad / Habitación / Paquete — que cambia los campos y crea el
 * documento correcto con los endpoints existentes. Precio y seña los calcula
 * el backend desde el catálogo (matriz por día/edad + temporada + promoción).
 */
export default function NewTicketWizard({ open, onOpenChange }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { activeEstablishment, isAllEstablishments, isAdmin } = useActiveEstablishment();
    const [form, setForm] = useState(EMPTY);
    const [submitting, setSubmitting] = useState(false);
    const createTicket = useFrappeCreate("Cheese Ticket");
    const createContact = useFrappeCreate("Cheese Contact");

    const company = form.company || activeEstablishment;
    const set = (patch) => setForm((f) => ({ ...f, ...patch }));
    const reset = () => setForm(EMPTY);

    // Disponibilidad del slot elegido: "quedan X lugares".
    const { data: daySlots } = useQuery({
        queryKey: ["wizard-day-slots", form.experience, form.selected_date],
        enabled: !!form.experience && !!form.selected_date && form.type === "ACTIVITY",
        queryFn: async () => {
            const params = new URLSearchParams({ experience_id: form.experience, date: form.selected_date });
            const res = await apiRequest(`/api/method/cheese.api.v1.availability_controller.get_available_slots?${params}`);
            const payload = res?.data?.message || res?.data || {};
            return (payload?.data || payload)?.slots || [];
        },
    });
    const availableCapacity = form.slot
        ? daySlots?.find((s) => s.slot_id === form.slot)?.available_capacity
        : undefined;

    const experienceTypeFilter =
        form.type === "HOTEL" ? { experience_type: "HOTEL" } : { experience_type: ["!=", "HOTEL"] };

    const resolveContact = async () => {
        if (form.clientMode === "existing") {
            if (!form.contact) throw new Error(t("ticketWizard.contactRequired", "Selecciona el cliente"));
            return form.contact;
        }
        if (!form.newClientPhone) throw new Error(t("ticketWizard.phoneRequired", "El teléfono del cliente nuevo es requerido"));
        return await new Promise((resolve, reject) => {
            createContact.mutate(
                { full_name: form.newClientName || form.newClientPhone, phone: form.newClientPhone },
                {
                    onSuccess: (res) => {
                        const doc = res?.data?.data || res?.data || {};
                        resolve(doc.name || form.newClientPhone);
                    },
                    onError: reject,
                }
            );
        });
    };

    const handleCreate = async () => {
        setSubmitting(true);
        try {
            if (form.type !== "ROUTE" && !company) {
                throw new Error(t("ticketWizard.companyRequired", "Selecciona el establecimiento"));
            }
            const contactId = await resolveContact();

            if (form.type === "ROUTE") {
                if (!form.route) throw new Error(t("ticketWizard.packageRequired", "Selecciona el paquete"));
                if (!form.selected_date) throw new Error(t("ticketWizard.dateRequired", "La fecha es requerida"));
                const res = await bookingService.createRouteReservation({
                    contact_id: contactId,
                    route_id: form.route,
                    party_size: parseInt(form.party_size) || 1,
                    date_from: form.selected_date,
                    date_to: form.date_to || undefined,
                    notes: form.notes?.trim() || undefined,
                });
                const payload = res?.data?.message || res?.data || res;
                if (payload?.success === false) {
                    throw new Error(payload?.error?.message || payload?.message || t("common.failed", "Error"));
                }
            } else {
                if (!form.experience) throw new Error(t("ticketWizard.experienceRequired", "Selecciona la experiencia"));
                if (!form.slot) throw new Error(t("ticketWizard.slotRequired", "Selecciona el horario"));
                const payload = {
                    contact: contactId,
                    company: company || undefined,
                    experience: form.experience,
                    slot: form.slot,
                    status: form.status,
                    notes: form.notes?.trim() || undefined,
                };
                if (form.type === "HOTEL") {
                    if (!form.check_in_date || !form.check_out_date) {
                        throw new Error(t("hotelReservations.datesRequired", "Check-in y check-out son requeridos"));
                    }
                    if (form.check_out_date <= form.check_in_date) {
                        throw new Error(t("hotelReservations.checkOutBeforeCheckInError", "El check-out debe ser posterior al check-in"));
                    }
                    payload.rooms_requested = parseInt(form.rooms_requested) || 1;
                    payload.check_in_date = form.check_in_date;
                    payload.check_out_date = form.check_out_date;
                    payload.party_size = 1;
                } else {
                    payload.party_size = parseInt(form.party_size) || 1;
                    payload.selected_date = form.selected_date || undefined;
                }
                await new Promise((resolve, reject) => {
                    createTicket.mutate(payload, { onSuccess: resolve, onError: reject });
                });
            }

            toast.success(t("ticketWizard.created", "Reserva creada"));
            queryClient.invalidateQueries();
            reset();
            onOpenChange(false);
        } catch (err) {
            toast.error(err?.message || t("common.failed", "Error"));
        } finally {
            setSubmitting(false);
        }
    };

    const slotDateAnchor = form.type === "HOTEL" ? (form.check_in_date || todayStr()) : (form.selected_date || todayStr());

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="w-5 h-5 text-cheese-600" /> {t("ticketWizard.title", "Nueva reserva")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("ticketWizard.description", "El precio y la seña se calculan del catálogo al crear (incluye matriz por día/edad, temporada y promociones).")}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    {/* Tipo */}
                    <div className="space-y-1">
                        <Label>{t("ticketWizard.whatIsBooked", "¿Qué se reserva?")}</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {TYPES.map(({ key, labelKey, label, icon: Icon }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => set({ type: key, experience: "", slot: "", route: "" })}
                                    className={`flex items-center justify-center gap-1.5 h-9 rounded-md border text-sm font-medium transition-colors ${form.type === key
                                        ? "bg-cheese-500 text-black border-cheese-500"
                                        : "bg-background border-input text-muted-foreground hover:text-foreground"}`}
                                >
                                    <Icon className="w-4 h-4" /> {t(labelKey, label)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Establecimiento (solo cuando el admin está en "Toda la ruta"; los paquetes cruzan establecimientos) */}
                    {form.type !== "ROUTE" && isAdmin && isAllEstablishments && (
                        <div className="space-y-1">
                            <Label>{t("common.company", "Establecimiento")} <span className="text-red-500">*</span></Label>
                            <CompanySelect
                                value={form.company}
                                onChange={(v) => set({ company: v, experience: "", slot: "" })}
                                autoFill={false}
                                filters={form.type === "HOTEL" ? { cheese_is_hotel: 1 } : {}}
                            />
                        </div>
                    )}

                    {/* Selección por tipo */}
                    {form.type === "ROUTE" ? (
                        <>
                            <div className="space-y-1">
                                <Label>{t("ticketWizard.package", "Paquete")} <span className="text-red-500">*</span></Label>
                                <FrappeSearchSelect
                                    doctype="Cheese Route"
                                    label="short_description"
                                    value={form.route}
                                    onChange={(v) => set({ route: v })}
                                    filters={{ status: "ONLINE" }}
                                    placeholder={t("ticketWizard.selectPackage", "Elegir paquete…")}
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <Label>{t("common.date", "Fecha")} <span className="text-red-500">*</span></Label>
                                    <Input type="date" min={todayStr()} value={form.selected_date} onChange={(e) => set({ selected_date: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <Label>{t("bookings.dateTo", "Fin (hoteles)")}</Label>
                                    <Input type="date" min={form.selected_date || todayStr()} value={form.date_to} onChange={(e) => set({ date_to: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <Label>{t("ticketWizard.people", "Personas")}</Label>
                                    <Input type="number" min="1" value={form.party_size} onChange={(e) => set({ party_size: e.target.value })} />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {t("ticketWizard.packageNote", "Se crea un ticket por experiencia del paquete; el sistema elige horarios sin solaparse con cupo disponible.")}
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="space-y-1">
                                <Label>{form.type === "HOTEL" ? t("ticketWizard.roomType", "Habitación") : t("tickets.experience", "Experiencia")} <span className="text-red-500">*</span></Label>
                                <FrappeSearchSelect
                                    doctype="Cheese Experience"
                                    label="name"
                                    value={form.experience}
                                    onChange={(v) => set({ experience: v, slot: "" })}
                                    filters={company ? { company, ...experienceTypeFilter } : experienceTypeFilter}
                                    placeholder={t("ticketWizard.fromCatalog", "Del catálogo del establecimiento…")}
                                />
                            </div>
                            {form.type === "HOTEL" ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <Label>{t("hotelReservations.checkInDate", "Check-in")} <span className="text-red-500">*</span></Label>
                                        <Input type="date" min={todayStr()} value={form.check_in_date} onChange={(e) => set({ check_in_date: e.target.value, slot: "" })} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>{t("hotelReservations.checkOutDate", "Check-out")} <span className="text-red-500">*</span></Label>
                                        <Input type="date" min={form.check_in_date || todayStr()} value={form.check_out_date} onChange={(e) => set({ check_out_date: e.target.value })} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>{t("hotelReservations.roomsRequested", "Habitaciones")}</Label>
                                        <Input type="number" min="1" value={form.rooms_requested} onChange={(e) => set({ rooms_requested: e.target.value })} />
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label>{t("common.date", "Fecha")}</Label>
                                        <Input type="date" min={todayStr()} value={form.selected_date} onChange={(e) => set({ selected_date: e.target.value, slot: "" })} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label>{t("ticketWizard.people", "Personas")}</Label>
                                        <Input type="number" min="1" value={form.party_size} onChange={(e) => set({ party_size: e.target.value })} />
                                    </div>
                                </div>
                            )}
                            <div className="space-y-1">
                                <Label>{t("ticketWizard.slot", "Horario")} <span className="text-red-500">*</span></Label>
                                <FrappeSearchSelect
                                    doctype="Cheese Experience Slot"
                                    label="name"
                                    value={form.slot}
                                    onChange={(v) => set({ slot: v })}
                                    placeholder={t("ticketWizard.selectSlot", "Elegir horario…")}
                                    filters={form.experience ? {
                                        experience: form.experience,
                                        date_from: ["<=", slotDateAnchor],
                                        date_to: [">=", slotDateAnchor],
                                    } : {}}
                                />
                                {form.type === "HOTEL" && (
                                    <p className="text-xs text-muted-foreground">{t("hotelReservations.selectSlotInfo", "El horario corresponde a la primera noche.")}</p>
                                )}
                                {form.type === "ACTIVITY" && availableCapacity != null && (
                                    <p className={`text-xs font-medium ${availableCapacity >= (parseInt(form.party_size) || 1) ? "text-emerald-600" : "text-red-600"}`}>
                                        {availableCapacity >= (parseInt(form.party_size) || 1)
                                            ? t("ticketWizard.spotsLeft", "✓ Quedan {{n}} lugares", { n: availableCapacity })
                                            : t("ticketWizard.notEnoughSpots", "⚠ Solo quedan {{n}} lugares", { n: availableCapacity })}
                                    </p>
                                )}
                            </div>
                        </>
                    )}

                    {/* Cliente */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <Label>{t("ticketWizard.client", "Cliente")} <span className="text-red-500">*</span></Label>
                            <button
                                type="button"
                                className="text-xs text-cheese-700 font-medium"
                                onClick={() => set({ clientMode: form.clientMode === "existing" ? "new" : "existing" })}
                            >
                                {form.clientMode === "existing"
                                    ? t("ticketWizard.createNewClient", "+ Cliente nuevo")
                                    : t("ticketWizard.pickExistingClient", "Buscar existente")}
                            </button>
                        </div>
                        {form.clientMode === "existing" ? (
                            <FrappeSearchSelect
                                doctype="Cheese Contact"
                                label="full_name"
                                value={form.contact}
                                onChange={(v) => set({ contact: v })}
                                placeholder={t("tickets.selectContact", "Buscar cliente…")}
                            />
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                <Input placeholder={t("ticketWizard.name", "Nombre")} value={form.newClientName} onChange={(e) => set({ newClientName: e.target.value })} />
                                <Input placeholder={t("ticketWizard.phone", "Teléfono")} value={form.newClientPhone} onChange={(e) => set({ newClientPhone: e.target.value })} />
                            </div>
                        )}
                    </div>

                    {/* Estado inicial + notas */}
                    {form.type !== "ROUTE" && (
                        <div className="space-y-1">
                            <Label>{t("common.status", "Estado")}</Label>
                            <select
                                value={form.status}
                                onChange={(e) => set({ status: e.target.value })}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                            >
                                <option value="PENDING">{t("status.PENDING", "Pendiente")}</option>
                                <option value="CONFIRMED">{t("status.CONFIRMED", "Confirmado")}</option>
                            </select>
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label>{t("tickets.notes", "Notas")}</Label>
                        <Textarea
                            rows={2}
                            value={form.notes}
                            onChange={(e) => set({ notes: e.target.value })}
                            placeholder={t("tickets.notesPlaceholder", "Restricciones alimentarias, accesibilidad, etc.")}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel", "Cancelar")}</Button>
                    <Button
                        className="bg-cheese-500 hover:bg-cheese-600 text-black font-semibold"
                        onClick={handleCreate}
                        disabled={submitting}
                    >
                        {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                        {t("ticketWizard.create", "Crear reserva")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
