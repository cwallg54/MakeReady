"use client";

export function ConfirmButton({
  children,
  message,
  className = "",
  formAction,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  // Optional server action to submit to, overriding the enclosing form's action.
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
