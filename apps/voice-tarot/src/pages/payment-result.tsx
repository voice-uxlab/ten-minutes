import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
export function PaymentResult() {
  const location = useLocation();
  return (
    <section className="page">
      <h1>
        {location.state?.demoGranted
          ? "데모 이용권을 추가했어요."
          : "확인할 결제 내역이 없어요."}
      </h1>
      <p>실제 결제는 진행하지 않았어요.</p>
      <Button asChild>
        <Link to="/">레나 만나러 가기</Link>
      </Button>
    </section>
  );
}
