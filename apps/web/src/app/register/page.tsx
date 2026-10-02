import { AuthScreen } from "@/components/auth-chat/auth-screen";
import { ClassicRegister } from "@/components/auth-chat/classic-register";

export default function RegisterPage() {
  return <AuthScreen start="register" classic={<ClassicRegister />} />;
}
