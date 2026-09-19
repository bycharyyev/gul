import type { Metadata } from "next";
import Link from "next/link";
import { InfoArticle, SectionTitle } from "@/components/info-article";

export const metadata: Metadata = {
  title: "О компании",
  description:
    "Gulyaly — сервис пополнения мобильных операторов и цифровых сервисов, маркетплейс продавцов и доставка карго. Ашхабад, Туркменистан.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <InfoArticle title="О Gulyaly">
      <p>
        Gulyaly — сервис для жителей Туркменистана, который собирает в одном месте то, чем люди пользуются каждый
        день: пополнение мобильной связи и цифровых сервисов, покупки у проверенных продавцов и доставка посылок.
      </p>

      <SectionTitle>Что можно сделать в Gulyaly</SectionTitle>
      <p>
        <strong>Пополнить баланс.</strong> Выберите оператора или сервис, укажите номер и сумму. Заказ обрабатывается
        автоматически, статус виден на странице{" "}
        <Link href="/track" className="text-brand-600 underline dark:text-brand-300">
          проверки заказа
        </Link>
        .
      </p>
      <p>
        <strong>Купить в галерее.</strong> В{" "}
        <Link href="/gallery" className="text-brand-600 underline dark:text-brand-300">
          галерее
        </Link>{" "}
        продавцы выставляют товары и услуги со своими ценами, а у каждого продавца есть собственная страница магазина.
      </p>
      <p>
        <strong>Отправить карго.</strong> В разделе{" "}
        <Link href="/cargo" className="text-brand-600 underline dark:text-brand-300">
          карго
        </Link>{" "}
        можно рассчитать и оформить доставку.
      </p>
      <p>
        <strong>Стать продавцом.</strong> Оставьте заявку на странице{" "}
        <Link href="/become-seller" className="text-brand-600 underline dark:text-brand-300">
          «Стать продавцом»
        </Link>
        , и мы свяжемся с вами после проверки.
      </p>

      <SectionTitle>Как мы относимся к данным и деньгам</SectionTitle>
      <p>
        Мы собираем только то, что нужно для выполнения заказа, и не передаём это третьим лицам сверх необходимого.
        Подробности — в{" "}
        <Link href="/privacy" className="text-brand-600 underline dark:text-brand-300">
          политике конфиденциальности
        </Link>{" "}
        и{" "}
        <Link href="/terms" className="text-brand-600 underline dark:text-brand-300">
          условиях использования
        </Link>
        .
      </p>

      <SectionTitle>Связаться с нами</SectionTitle>
      <p>
        Вопросы по заказам, сотрудничество и предложения — на странице{" "}
        <Link href="/contact" className="text-brand-600 underline dark:text-brand-300">
          контактов
        </Link>{" "}
        или по адресу support@gulyaly.com.
      </p>
    </InfoArticle>
  );
}
