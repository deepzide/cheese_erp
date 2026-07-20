import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Landmark, Search, X, Loader2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useFrappeCreate } from "@/lib/useApiData";
import CreatePageLayout from "@/components/CreatePageLayout";
import FrappeSearchSelect from "@/components/FrappeSearchSelect";
import { establishmentService } from "@/api/establishmentService";
import { useTranslation } from "react-i18next";

/**
 * Establishment picker backed by the permission-scoped `list_establishments`
 * endpoint. The raw `/api/resource/Company` route is not readable by
 * establishment-level users, which is why the generic FrappeSearchSelect
 * returned no results here.
 */
function parseEstablishmentRows(res) {
    const payload = res?.data?.message || res?.data || {};
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.map((r) => ({ value: r.company_id, label: r.company_name || r.company_id }));
}

function EstablishmentSearchSelect({ value, onChange, placeholder, presetOptions = [] }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const { data: searchedOptions = [], isLoading } = useQuery({
        queryKey: ["bank-account-establishments", searchTerm],
        queryFn: async () => {
            const res = await establishmentService.listEstablishments({
                page: 1,
                page_size: 50,
                search: searchTerm || undefined,
            });
            return parseEstablishmentRows(res);
        },
        staleTime: 10000,
    });

    const options = searchTerm ? searchedOptions : (searchedOptions.length ? searchedOptions : presetOptions);
    const selected = options.find((o) => o.value === value) || presetOptions.find((o) => o.value === value);
    const displayLabel = selected ? selected.label : value;

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`w-full flex items-center justify-between h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background transition-colors overflow-hidden hover:border-cheese-400 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer ${open ? 'border-cheese-400 ring-2 ring-ring ring-offset-2' : ''}`}
            >
                <span className={`${value ? "text-foreground" : "text-muted-foreground"} flex-1 min-w-0 truncate text-left pr-2`}>
                    {value ? displayLabel : (placeholder || t("bankAccounts.selectEstablishment", "Seleccionar empresa..."))}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {value && (
                        <span
                            onClick={(e) => { e.stopPropagation(); onChange(""); setSearchTerm(""); }}
                            className="p-0.5 rounded hover:bg-muted cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {open && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95">
                    <div className="p-2 border-b border-border">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder={t("bankAccounts.searchEstablishment", "Buscar empresa...")}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 h-8 text-sm"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">{t("common.loading", "Loading...")}</span>
                            </div>
                        ) : options.length > 0 ? (
                            options.map((opt) => {
                                const isSelected = opt.value === value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => { onChange(opt.value); setOpen(false); setSearchTerm(""); }}
                                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between gap-2 ${isSelected ? 'bg-cheese-100 dark:bg-cheese-900/30 text-cheese-700 dark:text-cheese-400 font-medium' : 'hover:bg-muted text-foreground'}`}
                                    >
                                        <span className="truncate min-w-0 flex-1">
                                            {opt.label}
                                            {opt.label !== opt.value && (
                                                <span className="ml-2 text-[10px] font-mono text-muted-foreground">{opt.value}</span>
                                            )}
                                        </span>
                                        {isSelected && <Badge className="text-[9px] bg-cheese-500/20 text-cheese-700 dark:text-cheese-400">{t("common.selected", "Selected")}</Badge>}
                                    </button>
                                );
                            })
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">{t("common.noResults", "Sin resultados")}</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function BankAccountCreate() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialRoute = searchParams.get('route') || "";
    const initialCompany = searchParams.get('company') || "";
    const [form, setForm] = useState({
        entity_type: initialCompany ? "Company" : initialRoute ? "Cheese Route" : "Company",
        entity_id: initialCompany || initialRoute || "",
        holder: "", bank: "", account: "", description: "", iban: "", currency: "UYU",
        category: "BANK_ACCOUNT",
        account_email: "", paypal_me_link: "", mp_alias_cvu: "",
        account_country: "", dlocal_provider_network: "", dlocal_agreement_id: "",
    });
    const createMutation = useFrappeCreate("Cheese Bank Account");

    const isCompany = form.entity_type === "Company";

    // Pre-fetch the establishments the current user can access so an
    // establishment-level user (who is scoped to a single company) gets it
    // auto-selected without any Route Administrator intervention.
    const { data: establishments = [] } = useQuery({
        queryKey: ["bank-account-establishments-initial"],
        queryFn: async () => {
            const res = await establishmentService.listEstablishments({ page: 1, page_size: 50 });
            return parseEstablishmentRows(res);
        },
    });

    const isScopedEstablishmentUser = establishments.length === 1 && !initialRoute;

    // Establishment-level users should land on Empresa, not Ruta.
    useEffect(() => {
        if (initialRoute || initialCompany) return;
        if (establishments.length !== 1) return;
        setForm((f) => {
            if (f.entity_type === "Company" && f.entity_id) return f;
            return { ...f, entity_type: "Company", entity_id: establishments[0].value };
        });
    }, [establishments, initialRoute, initialCompany]);

    useEffect(() => {
        if (isCompany && !form.entity_id && establishments.length === 1) {
            setForm((f) => ({ ...f, entity_id: establishments[0].value }));
        }
    }, [isCompany, form.entity_id, establishments]);

    const handleLinkTypeChange = (entityType) => {
        setForm((f) => {
            const next = { ...f, entity_type: entityType, entity_id: "" };
            if (entityType === "Company" && establishments.length === 1) {
                next.entity_id = establishments[0].value;
            }
            return next;
        });
    };

    const handleSubmit = () => {
        if (!form.entity_id) {
            toast.error(
                isCompany
                    ? t("bankAccounts.establishmentRequired", "La empresa es obligatoria")
                    : t("bankAccounts.routeRequired", "La ruta es obligatoria")
            );
            return;
        }
        const payload = {
            entity_type: form.entity_type,
            entity_id: form.entity_id,
            holder: form.holder,
            bank: form.bank,
            account: form.account,
            description: form.description,
            iban: form.iban || undefined,
            currency: form.currency,
            category: form.category,
            account_email: form.account_email || undefined,
            paypal_me_link: form.paypal_me_link || undefined,
            mp_alias_cvu: form.mp_alias_cvu || undefined,
            account_country: form.account_country || undefined,
            dlocal_provider_network: form.dlocal_provider_network || undefined,
            dlocal_agreement_id: form.dlocal_agreement_id || undefined,
            status: "ACTIVE",
        };
        if (form.entity_type === "Cheese Route") {
            payload.route = form.entity_id;
        }
        createMutation.mutate(payload, {
            onSuccess: () => { toast.success(t("bankAccounts.accountAdded", "Bank account added")); navigate("/cheese/bank-accounts"); },
            onError: (err) => toast.error(err?.message || t("common.failed", "Failed")),
        });
    };

    return (
        <CreatePageLayout
            title={t("bankAccounts.newBankAccount", "Nuevo Método de Pago")}
            description={t("bankAccounts.linkDescription", "Vincular una cuenta bancaria a una ruta o empresa")}
            icon={Landmark}
            backPath="/cheese/bank-accounts"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
            submitLabel={t("bankAccounts.addBankAccount", "Agregar Método de Pago")}
        >
            <div className="space-y-5">
                <div className="space-y-2">
                    <Label>{t("bankAccounts.linkTo", "Vincular A")} <span className="text-red-500">*</span></Label>
                    <Select value={form.entity_type} onValueChange={handleLinkTypeChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {!isScopedEstablishmentUser && (
                                <SelectItem value="Cheese Route">{t("bankAccounts.route", "Ruta")}</SelectItem>
                            )}
                            <SelectItem value="Company">{t("bankAccounts.establishment", "Empresa")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>{isCompany ? t("bankAccounts.establishmentLabel", "Empresa") : t("bankAccounts.routeLabel", "Ruta")} <span className="text-red-500">*</span></Label>
                    {isCompany ? (
                        <EstablishmentSearchSelect
                            value={form.entity_id}
                            onChange={(v) => setForm(f => ({ ...f, entity_id: v }))}
                            placeholder={t("bankAccounts.selectEstablishment", "Seleccionar empresa...")}
                            presetOptions={establishments}
                        />
                    ) : (
                        <FrappeSearchSelect
                            doctype="Cheese Route"
                            label="name"
                            value={form.entity_id}
                            onChange={(v) => setForm(f => ({ ...f, entity_id: v }))}
                            placeholder={t("bankAccounts.selectRoute", "Seleccionar ruta...")}
                        />
                    )}
                </div>
                <div className="space-y-2 max-w-[280px]">
                    <Label>{t("bankAccounts.category", "Tipo de método de pago")}</Label>
                    <select
                        value={form.category}
                        onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                    >
                            <option value="BANK_ACCOUNT">{t("bankAccounts.catBANK_ACCOUNT", "Cuenta Bancaria")}</option>
                            <option value="PAYPAL">{t("bankAccounts.catPAYPAL", "PayPal")}</option>
                            <option value="MERCADO_PAGO">{t("bankAccounts.catMERCADO_PAGO", "Mercado Pago")}</option>
                            <option value="DLOCAL">{t("bankAccounts.catDLOCAL", "dLocal")}</option>
                    </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("bankAccounts.holderLabel", "Titular")}</Label>
                        <Input placeholder={t("bankAccounts.holderLabel", "Nombre de empresa")} value={form.holder} onChange={(e) => setForm(f => ({ ...f, holder: e.target.value }))} />
                    </div>
                    {form.category === "BANK_ACCOUNT" && (
                    <div className="space-y-2">
                        <Label>{t("bankAccounts.bankLabel", "Banco")}</Label>
                        <Input placeholder={t("bankAccounts.bankLabel", "Nombre del banco")} value={form.bank} onChange={(e) => setForm(f => ({ ...f, bank: e.target.value }))} />
                    </div>
                    )}
                </div>
                {form.category === "BANK_ACCOUNT" && (
                <div className="space-y-2">
                        <Label>{t("bankAccounts.ibanLabel", "IBAN")}</Label>
                    <Input placeholder="FR76 3000 4000 0500 0006 7890 123" value={form.iban} onChange={(e) => setForm(f => ({ ...f, iban: e.target.value }))} className="font-mono" />
                </div>
                )}
                {["PAYPAL", "MERCADO_PAGO"].includes(form.category) && (
                    <div className="space-y-2">
                        <Label>{form.category === "PAYPAL" ? t("bankAccounts.paypalEmail", "Correo de la cuenta (PayPal ID)") : t("bankAccounts.mpEmail", "Correo de la cuenta")}</Label>
                        <Input type="email" placeholder="pagos@tunegocio.com" value={form.account_email} onChange={(e) => setForm(f => ({ ...f, account_email: e.target.value }))} />
                    </div>
                )}
                {form.category === "PAYPAL" && (
                    <div className="space-y-2">
                        <Label>{t("bankAccounts.paypalMe", "Enlace PayPal.Me (opcional)")}</Label>
                        <Input placeholder="paypal.me/TuNegocio" value={form.paypal_me_link} onChange={(e) => setForm(f => ({ ...f, paypal_me_link: e.target.value }))} />
                    </div>
                )}
                {form.category === "MERCADO_PAGO" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <Label>{t("bankAccounts.mpAlias", "Alias / CVU")}</Label>
                            <Input placeholder="tunegocio.mp" value={form.mp_alias_cvu} onChange={(e) => setForm(f => ({ ...f, mp_alias_cvu: e.target.value }))} className="font-mono" />
                        </div>
                        <div className="space-y-2">
                            <Label>{t("bankAccounts.accountCountry", "País de la cuenta")}</Label>
                            <Input placeholder="Uruguay" value={form.account_country} onChange={(e) => setForm(f => ({ ...f, account_country: e.target.value }))} />
                        </div>
                    </div>
                )}
                {form.category === "DLOCAL" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <Label>{t("bankAccounts.dlocalNetwork", "Proveedor local / Red")}</Label>
                            <Input placeholder="OXXO, Abitab, RedPagos..." value={form.dlocal_provider_network} onChange={(e) => setForm(f => ({ ...f, dlocal_provider_network: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <Label>{t("bankAccounts.dlocalAgreement", "ID de convenio / comitente")}</Label>
                            <Input placeholder="12345" value={form.dlocal_agreement_id} onChange={(e) => setForm(f => ({ ...f, dlocal_agreement_id: e.target.value }))} className="font-mono" />
                        </div>
                        <div className="space-y-2">
                            <Label>{t("bankAccounts.accountCountry", "País de recaudación")}</Label>
                            <Input placeholder="México" value={form.account_country} onChange={(e) => setForm(f => ({ ...f, account_country: e.target.value }))} />
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {form.category === "BANK_ACCOUNT" && (
                    <div className="space-y-2">
                        <Label>{t("bankAccounts.account", "Numero de cuenta")}</Label>
                        <Input placeholder={t("bankAccounts.account", "Numero de cuenta")} value={form.account} onChange={(e) => setForm(f => ({ ...f, account: e.target.value }))} className="font-mono" />
                    </div>
                    )}
                    <div className="space-y-2">
                        <Label>{t("bankAccounts.paymentInstructions", "Instrucciones de pago")}</Label>
                        <Input placeholder={t("bankAccounts.paymentInstructionsPh", "ej. Seleccioná Bienes y Servicios / Convenio 12345 en OXXO")} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                        <Label>{t("bankAccounts.currency", "Moneda")}</Label>
                        <Select value={form.currency} onValueChange={(v) => setForm(f => ({ ...f, currency: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="UYU">UYU</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="GBP">GBP</SelectItem>
                                <SelectItem value="MAD">MAD</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>
        </CreatePageLayout>
    );
}
