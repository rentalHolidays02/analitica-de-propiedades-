import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, igualSeguro, tokenSesion } from "@/lib/auth";

// Todo pide sesion menos el propio login y los estaticos.
export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};

export default async function proxy(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE)?.value ?? "";
  if (cookie && igualSeguro(cookie, await tokenSesion())) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}
