# Barbershop Booking App - PRD

## Overview
Mobile + Web booking app for "Barber Shop di Francesco Moretti" (Valfabbrica, Umbria). Alternative to Treatwell with a custom admin dashboard.

## Users
- Customer: browses services, books slots, joins waitlist, receives reminders
- Admin (Francesco): manages bookings, services, clients, blacklist, force-online-pay

## Auth
- Email/password (JWT bcrypt)
- Google OAuth (Emergent-managed)
- Biometric quick-unlock (Face ID/Touch ID via expo-local-authentication)

## Core Features
1. Services catalog (Taglio Uomo, Combo Taglio+Barba, Sfumatura, etc.)
2. Calendar-based slot booking (business hours 9-19, 30-min grid)
3. Custom reminders (customer picks 24h/12h/2h before)
4. Waitlist with auto-notification when slot opens
5. Admin diary (14-day date strip, stats: bookings/revenue/waitlist)
6. Admin client management (search, must_pay_online toggle, blacklist)
7. Admin service management (CRUD)
8. Stripe payment intent for forced online payment
9. Shareable public link for Instagram bio (works on web browser)

## Stack
- Backend: FastAPI + MongoDB (motor)
- Frontend: Expo SDK 54, Expo Router file-based
- Payments: Stripe (test mode)
- Email: Resend (optional; logs when API key missing)
