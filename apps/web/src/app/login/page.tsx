import { AuthScreen } from "@/components/auth-chat/auth-screen";
import { ClassicLogin } from "@/components/auth-chat/classic-login";

export default function LoginPage() {
  return <AuthScreen start="ask" classic={<ClassicLogin />} />;
}
