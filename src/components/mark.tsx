export function LeeLogo({
  variant = "lockup",
  className = "",
}: {
  variant?: "lockup" | "mark";
  className?: string;
}) {
  if (variant === "mark") {
    return <img src="/lee-mark.svg" alt="" className={className} />;
  }
  return (
    <img
      src="/lee-logo.svg"
      alt="Lee & Associates Commercial Real Estate Services"
      className={className}
    />
  );
}
