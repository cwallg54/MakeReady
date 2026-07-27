// Renders a phone number as a tap-to-dial link. On iPhone and Android a tap
// opens the dialer pre-filled with the number; on desktop it hands off to the
// default calling app. The href keeps only digits and a leading +, while the
// visible text stays formatted.
export function PhoneLink({ phone, className = "" }: { phone: string; className?: string }) {
  const tel = phone.replace(/[^\d+]/g, "");
  if (!tel) return <span className={className}>{phone}</span>;
  return (
    <a href={`tel:${tel}`} className={`text-blue-600 hover:underline ${className}`}>
      {phone}
    </a>
  );
}

// Companion tap-to-email link.
export function EmailLink({ email, className = "" }: { email: string; className?: string }) {
  return (
    <a href={`mailto:${email}`} className={`text-blue-600 hover:underline ${className}`}>
      {email}
    </a>
  );
}
