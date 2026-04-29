import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import AuthGuard from '@/components/auth/AuthGuard';
import Login from './Login';
import Layout from './Layout';
import Dashboard from './Dashboard';
import Tickets from './Tickets';
import TicketDetail from './TicketDetail';
import RoutesPage from './Routes';
import RouteDetail from './RouteDetail';
import Experiences from './Experiences';
import ExperienceDetail from './ExperienceDetail';
import ExperienceCreate from './ExperienceCreate';
import Calendar from './Calendar';
import Contacts from './Contacts';
import Leads from './Leads';
import Quotations from './Quotations';
import Deposits from './Deposits';
import Bookings from './Bookings';
import Support from './Support';
import BookingPolicy from './BookingPolicy';
import BankAccounts from './BankAccounts';
import Attendance from './Attendance';
import Documents from './Documents';
import QRTokens from './QRTokens';
import SurveyResponses from './SurveyResponses';
import SystemEvents from './SystemEvents';
import Conversations from './Conversations';
import ConversationDetail from './ConversationDetail';
import ContactDetail from './ContactDetail';
import ContactCreate from './ContactCreate';
import LeadDetail from './LeadDetail';
import LeadCreate from './LeadCreate';
import QuotationDetail from './QuotationDetail';
import QuotationCreate from './QuotationCreate';
import SupportCreate from './SupportCreate';
import BookingPolicyCreate from './BookingPolicyCreate';
import BankAccountCreate from './BankAccountCreate';
import DocumentCreate from './DocumentCreate';
import TicketCreate from './TicketCreate';
import BookingCreate from './BookingCreate';
import BookingDetail from './BookingDetail';
import DepositCreate from './DepositCreate';
import DepositDetail from './DepositDetail';
import BankAccountDetail from './BankAccountDetail';
import SupportDetail from './SupportDetail';
import Establishments from './Establishments';
import EstablishmentCreate from './EstablishmentCreate';
import EstablishmentDetail from './EstablishmentDetail';
import QRScan from './QRScan';
import Hotels from './Hotels';
import HotelReservations from './HotelReservations';
import HotelAvailability from './HotelAvailability';
import UsersPage from './Users';

export default function Pages() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/cheese/login" element={<Login />} />
                <Route
                    path="/cheese/*"
                    element={
                        <AuthGuard>
                            <Layout>
                                <AnimatePresence mode="wait">
                                    <Routes>
                                        <Route path="/dashboard" element={<Dashboard />} />
                                        <Route path="/tickets" element={<Tickets />} />
                                        <Route path="/tickets/new" element={<TicketCreate />} />
                                        <Route path="/tickets/:id" element={<TicketDetail />} />
                                        <Route path="/routes" element={<RoutesPage />} />
                                        <Route path="/routes/:id" element={<RouteDetail />} />
                                        <Route path="/experiences" element={<Experiences />} />
                                        <Route path="/experiences/new" element={<ExperienceCreate />} />
                                        <Route path="/experiences/:id" element={<ExperienceDetail />} />
                                        <Route path="/establishments" element={<Establishments />} />
                                        <Route path="/establishments/new" element={<EstablishmentCreate />} />
                                        <Route path="/establishments/:id" element={<EstablishmentDetail />} />
                                        <Route path="/calendar" element={<Calendar />} />
                                        <Route path="/contacts" element={<Contacts />} />
                                        <Route path="/contacts/new" element={<ContactCreate />} />
                                        <Route path="/contacts/:id" element={<ContactDetail />} />
                                        <Route path="/leads" element={<Leads />} />
                                        <Route path="/leads/new" element={<LeadCreate />} />
                                        <Route path="/leads/:id" element={<LeadDetail />} />
                                        <Route path="/quotations" element={<Quotations />} />
                                        <Route path="/quotations/new" element={<QuotationCreate />} />
                                        <Route path="/quotations/:id" element={<QuotationDetail />} />
                                        <Route path="/deposits" element={<Deposits />} />
                                        <Route path="/deposits/new" element={<DepositCreate />} />
                                        <Route path="/deposits/:id" element={<DepositDetail />} />
                                        <Route path="/bookings" element={<Bookings />} />
                                        <Route path="/bookings/new" element={<BookingCreate />} />
                                        <Route path="/bookings/:id" element={<BookingDetail />} />
                                        <Route path="/support" element={<Support />} />
                                        <Route path="/support/new" element={<SupportCreate />} />
                                        <Route path="/support/:id" element={<SupportDetail />} />
                                        <Route path="/booking-policy" element={<BookingPolicy />} />
                                        <Route path="/booking-policy/new" element={<BookingPolicyCreate />} />
                                        <Route path="/bank-accounts" element={<BankAccounts />} />
                                        <Route path="/bank-accounts/new" element={<BankAccountCreate />} />
                                        <Route path="/bank-accounts/:id" element={<BankAccountDetail />} />
                                        <Route path="/attendance" element={<Attendance />} />
                                        <Route path="/documents" element={<Documents />} />
                                        <Route path="/documents/new" element={<DocumentCreate />} />
                                        <Route path="/qr-tokens" element={<QRTokens />} />
                                        <Route path="/surveys" element={<SurveyResponses />} />
                                        <Route path="/scan" element={<QRScan />} />
                                        <Route path="/events" element={<SystemEvents />} />
                                        <Route path="/conversations" element={<Conversations />} />
                                        <Route path="/conversations/:id" element={<ConversationDetail />} />
                                        <Route path="/hotels" element={<Hotels />} />
                                        <Route path="/hotel-reservations" element={<HotelReservations />} />
                                        <Route path="/hotel-availability" element={<HotelAvailability />} />
                                        <Route path="/users" element={<UsersPage />} />
                                        <Route path="/" element={<Navigate to="/cheese/dashboard" replace />} />
                                        <Route path="*" element={<Navigate to="/cheese/dashboard" replace />} />
                                    </Routes>
                                </AnimatePresence>
                            </Layout>
                        </AuthGuard>
                    }
                />
                <Route path="*" element={<Navigate to="/cheese/login" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
