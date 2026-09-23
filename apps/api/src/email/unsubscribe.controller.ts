import { Controller, Get, Post, Query, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { EmailService } from "./email.service";

// Deliberately unauthenticated and outside the admin/mail prefix -- this is clicked by mail
// clients and recipients with no session. POST satisfies RFC 8058 one-click unsubscribe
// (List-Unsubscribe-Post: List-Unsubscribe=One-Click); GET exists for a recipient clicking the
// visible link in the email body directly.
@ApiTags("marketing")
@Controller("marketing")
export class UnsubscribeController {
  constructor(private email: EmailService) {}

  @Get("unsubscribe")
  async unsubscribeGet(@Query("uid") uid: string, @Query("token") token: string, @Res() res: Response) {
    const ok = await this.email.unsubscribe(uid, token);
    res
      .status(ok ? 200 : 400)
      .type("html")
      .send(
        ok
          ? "<p>Вы отписаны от рассылки Gulyaly.</p>"
          : "<p>Ссылка недействительна.</p>",
      );
  }

  @Post("unsubscribe")
  async unsubscribePost(@Query("uid") uid: string, @Query("token") token: string, @Res() res: Response) {
    const ok = await this.email.unsubscribe(uid, token);
    res.status(ok ? 200 : 400).send();
  }
}
