import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import AuthGuard from '@/components/auth/AuthGuard';
import HotelReservationDetail from './HotelReservationDetail';
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
import Backups from './Backups';
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
import CurrencyConverter from './CurrencyConverter';
import BookingSimulator from './BookingSimulator';
import ConversionHistory from './ConversionHistory';
import DocumentCreate from './DocumentCreate';
import DocumentDetail from './DocumentDetail';
import TicketCreate from './TicketCreate';
import BookingCreate from './BookingCreate';
import RouteBookingCreate from './RouteBookingCreate';
import BookingDetail from './BookingDetail';
import DepositCreate from './DepositCreate';
import DepositDetail from './DepositDetail';
import BankAccountDetail from './BankAccountDetail';
import Promotions from './Promotions';
import AgeGroups from './AgeGroups';
import DayRanges from './DayRanges';
import Seasons from './Seasons';
import SupportDetail from './SupportDetail';
import Establishments from './Establishments';
import EstablishmentCreate from './EstablishmentCreate';
import EstablishmentDetail from './EstablishmentDetail';
import QRScan from './QRScan';
import Hotels from './Hotels';
import HotelReservations from './HotelReservations';
import HotelAvailability from './HotelAvailability';
import HotelRooms from './HotelRooms';
import UsersPage from './Users';
import BotUsers from './BotUsers';
import EmailServer from './EmailServer';
import BotMetrics from './BotMetrics';
import WebhookSettings from './WebhookSettings';
import SemanticSearchTest from './SemanticSearchTest';
import SemanticSearchLogs from './SemanticSearchLogs';
import HotelCreate from './HotelCreate';
import HotelRoomCreate from './HotelRoomCreate';
import DataTransfer from './DataTransfer';
import { useHotelAccess } from '@/lib/useHotelAccess';

function HotelRouteGuard({ children }) {
    const { hasHotelAccess, isLoading } = useHotelAccess();

    if (isLoading) return null;
    if (!hasHotelAccess) return <Navigate to="/cheese/dashboard" replace />;
    return children;
}

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
                                <Outlet />
                            </Layout>
                        </AuthGuard>
                    }
                >
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="tickets" element={<Tickets />} />
                    <Route path="tickets/new" element={<TicketCreate />} />
                    <Route path="tickets/:id" element={<TicketDetail />} />
                    <Route path="routes" element={<RoutesPage />} />
                    <Route path="routes/:id" element={<RouteDetail />} />
                    <Route path="experiences" element={<Experiences />} />
                    <Route path="experiences/new" element={<ExperienceCreate />} />
                    <Route path="experiences/:id" element={<ExperienceDetail />} />
                    <Route path="establishments" element={<Establishments />} />
                    <Route path="establishments/new" element={<EstablishmentCreate />} />
                    <Route path="establishments/:id" element={<EstablishmentDetail />} />
                    <Route path="calendar" element={<Calendar />} />
                    <Route path="contacts" element={<Contacts />} />
                    <Route path="contacts/new" element={<ContactCreate />} />
                    <Route path="contacts/:id" element={<ContactDetail />} />
                    <Route path="leads" element={<Leads />} />
                    <Route path="leads/new" element={<LeadCreate />} />
                    <Route path="leads/:id" element={<LeadDetail />} />
                    <Route path="quotations" element={<Quotations />} />
                    <Route path="quotations/new" element={<QuotationCreate />} />
                    <Route path="quotations/:id" element={<QuotationDetail />} />
                    <Route path="deposits" element={<Deposits />} />
                    <Route path="deposits/new" element={<DepositCreate />} />
                    <Route path="deposits/:id" element={<DepositDetail />} />
                    <Route path="bookings" element={<Bookings />} />
                    <Route path="bookings/new" element={<BookingCreate />} />
                    <Route path="bookings/new-route" element={<RouteBookingCreate />} />
                    <Route path="bookings/:id" element={<BookingDetail />} />
                    <Route path="support" element={<Support />} />
                    <Route path="support/new" element={<SupportCreate />} />
                    <Route path="support/:id" element={<SupportDetail />} />
                    <Route path="booking-policy" element={<BookingPolicy />} />
                    <Route path="booking-policy/new" element={<BookingPolicyCreate />} />
                    <Route path="bank-accounts" element={<BankAccounts />} />
                    <Route path="bank-accounts/new" element={<BankAccountCreate />} />
                    <Route path="bank-accounts/:id" element={<BankAccountDetail />} />
                    <Route path="currency-converter" element={<CurrencyConverter />} />
                    <Route path="booking-simulator" element={<BookingSimulator />} />
                    <Route path="conversion-history" element={<ConversionHistory />} />
                    <Route path="promotions" element={<Promotions />} />
                    <Route path="age-groups" element={<AgeGroups />} />
                    <Route path="day-ranges" element={<DayRanges />} />
                    <Route path="seasons" element={<Seasons />} />
                    <Route path="attendance" element={<Attendance />} />
                    <Route path="documents" element={<Documents />} />
                    <Route path="documents/new" element={<DocumentCreate />} />
                    <Route path="documents/:id" element={<DocumentDetail />} />
                    <Route path="qr-tokens" element={<QRTokens />} />
                    <Route path="surveys" element={<SurveyResponses />} />
                    <Route path="scan" element={<QRScan />} />
                    <Route path="events" element={<SystemEvents />} />
                    <Route path="backups" element={<Backups />} />
                    <Route path="conversations" element={<Conversations />} />
                    <Route path="conversations/:id" element={<ConversationDetail />} />
                    <Route path="hotels" element={<HotelRouteGuard><Hotels /></HotelRouteGuard>} />
                    <Route path="hotels/new" element={<HotelRouteGuard><HotelCreate /></HotelRouteGuard>} />
                    <Route path="hotels/rooms/new" element={<HotelRouteGuard><HotelRoomCreate /></HotelRouteGuard>} />
                    <Route path="hotel-reservations" element={<HotelRouteGuard><HotelReservations /></HotelRouteGuard>} />
                    <Route path="hotels/reservations/:id" element={<HotelRouteGuard><HotelReservationDetail /></HotelRouteGuard>} />
                    <Route path="hotel-availability" element={<HotelRouteGuard><HotelAvailability /></HotelRouteGuard>} />
                    <Route path="hotel-rooms" element={<HotelRouteGuard><HotelRooms /></HotelRouteGuard>} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="bot-users" element={<BotUsers />} />
                    <Route path="email-server" element={<EmailServer />} />
                    <Route path="bot-metrics" element={<BotMetrics />} />
                    <Route path="webhook-settings" element={<WebhookSettings />} />
                    <Route path="semantic-search" element={<SemanticSearchTest />} />
                    <Route path="search-history" element={<SemanticSearchLogs />} />
                    <Route path="data-transfer" element={<DataTransfer />} />
                    <Route index element={<Navigate to="/cheese/dashboard" replace />} />
                    <Route path="*" element={<Navigate to="/cheese/dashboard" replace />} />
                </Route>
                <Route path="*" element={<Navigate to="/cheese/login" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
