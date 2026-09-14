# MakeReady update — leadership email body (14 September 2026)

**Suggested subject:** MakeReady: finance is live and reconciled to SAP, access controls tightened, two decisions needed

---

All,

MakeReady has moved a long way in the past two weeks. The headline is that the
finance side of the business now runs in it, on real balances that reconcile to
SAP. Below is where we stand, what it means, and the two decisions I need from
you.

**Finance is built and it is carrying real money.**

We went through the SAP system in detail — every report, every process, every
month-end routine — and rebuilt it in MakeReady. That covers the October–September
fiscal calendar with periods that open, close and lock; the segmented general
ledger and a P&L by segment; receivables and the collections desk; payables and
weekly payment runs; payroll journals; expense claims; sales tax; commission;
and the weekly flash and quarterly pack.

The open items came across from SAP at the 23 July cutover:

- 1,978 open customer invoices — $2,050,117.68
- 97 unapplied credit memos — $17,044.11
- 1,095 open supplier bills — $703,428.68

**It reconciles.** The general ledger carries every month from January 2008 to
the cutover — 223 monthly postings rolled up from SAP's 2.7 million journal
lines. Against SAP at that date: total assets $8,008,756.61 versus SAP's
$8,008,756.62, liabilities agreeing to the cent, and equity plus accumulated
earnings agreeing to a penny. Monthly revenue and costs match SAP to the cent
as well. The one penny is rounding from summarising to monthly totals.

**Two things our accountant should know.** First, the ledger is held at monthly
summary level, not transaction level, so you cannot drill from a historical GL
line back to an individual invoice — the invoice history is there, but it is not
linked line by line to the ledger. Second, MakeReady carries the profit and loss
cumulatively since 2008 and has not posted year-end closing entries, whereas SAP
has. The totals are identical; the split between the equity line and accumulated
earnings is not. It is straightforward to post the historical year-end closes if
we want the balance sheet to present exactly as SAP's did — I would like a
decision on that before anyone reads the balance sheet and is surprised by it.

**Access control has been tightened to a finance standard.**

Two-factor authentication is now mandatory across the organisation, and every
active account has a factor enrolled. More importantly, nothing defers it any
more. "Remember me" previously kept a session alive for thirty days, which in
practice meant a person could go a month without re-entering a password or a
second factor. That is the behaviour a regulated finance environment
specifically forbids, so it is gone.

There is now a single idle window — sixty minutes, configurable — that applies
to every session on every device. When it lapses, the user signs in again with
their password and their second factor. No device stays trusted between
sessions. The checkbox on the login page now does exactly what it says: it
remembers the email address, which is a convenience and not a credential. The
whole policy is covered by an automated check that runs against a live server,
so a future change cannot quietly loosen it.

Alongside that, reports now carry individual permissions — who may see a report,
who may change it, who may delete it — so financial reporting can be restricted
to the people who should have it, and that is auditable.

**Everything is documented, inside the system.**

There is now a full user guide in MakeReady itself, under Help. It walks the
whole business from the first enquiry through to a closed month and, for each
step, names the screen where the work happens — nineteen sections, each with a
picture of the live screen. There is a Word copy to download for anyone who
wants it on paper. It is generated from the application, so keeping it current
is a re-run rather than a rewrite, and it will not drift the way documentation
usually does.

**Also delivered in this stretch:** fixed assets and depreciation, cost centres
and job costing, quality inspections, equipment maintenance, workflows and
approvals, and the Content Library moving onto Azure storage.

**What I need from you**

1. **Sales rep accounts.** Thirteen accounts are created but switched off, with
   no password, because SAP holds no email addresses for the reps. I have used
   the usual first.last@g54.com pattern as a placeholder. I need the addresses
   confirmed before we activate them and send invitations. Nothing goes out
   until someone says so.
2. **The year-end close question above** — whether to post historical closing
   entries so the balance sheet presents the way SAP's did.

**Two things still outstanding**

- The Content Library is built but not switched on; it needs the Azure share
  name and credentials.
- We are replacing Zoey rather than connecting to it. Zoey's catalogue is larger
  than what is in our own web store today, so there is a catalogue load to
  complete before Zoey can be switched off. I will come back with a plan and a
  date for that.

Happy to walk any of this through in person, and particularly keen that the
numbers get a second pair of eyes early rather than at year end.

Thanks,
Chris
