import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE, verifyAccessToken } from "@/lib/auth";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const valid = token ? await verifyAccessToken(token) : null;

  if (valid) {
    redirect("/chat");
  } else {
    redirect("/login");
  }
}
