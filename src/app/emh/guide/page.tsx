import Link from "next/link";
import { Shell } from "@/experiments/emh/components/shell";

export default function Guide() {
  return (
    <Shell>
      <article className="guide">
        <div className="eyebrow">参加者向け</div>
        <h1>取引のルール</h1>
        <p className="lead">
          各ラウンドはA期とB期の2つ。
          <br />
          証券を売買し、あなたの得点を増やします。
        </p>
        <section>
          <span className="step-number">01</span>
          <div>
            <h2>自分の配当を確認する</h2>
            <p>
              開始時に被験者番号がランダムに決まります。A期とB期の1単位あたりの配当は人によって異なり、実験中は変わりません。自分の配当を他の人に教えないでください。
            </p>
          </div>
        </section>
        <section>
          <span className="step-number">02</span>
          <div>
            <h2>1単位ずつ売買する</h2>
            <p>
              各ラウンドの最初に、教員が設定した数の証券を受け取ります（既定は2単位）。現在の最高買値より高い買値、または最低売値より低い売値を提示できます。相手の提示価格でそのまま取引することもできます。
            </p>
            <p>
              買値が売値以上になれば、先に出されていた相手の価格で1単位の取引が成立します。成立すると提示はリセットされます。自分の提示との取引や、持っていない証券の売却はできません。売買収支がマイナスでも購入できます。
            </p>
            <p>
              各取引の最初に1人がランダムに指名されます。指名は最初の提示のお願いです。全員がいつでも提示・取引できます。
            </p>
          </div>
        </section>
        <section>
          <span className="step-number">03</span>
          <div>
            <h2>期末に配当を受け取る</h2>
            <p>
              A期末の保有量に応じてA期の配当を受け取り、保有証券をそのままB期へ持ち越します。B期にも売買でき、B期末に配当を受け取ると証券はすべて消滅します。
            </p>
            <div className="formula">
              ラウンドの得点 ＝ 売却額 − 購入額 ＋ A期の配当 ＋ B期の配当
            </div>
          </div>
        </section>
        <section>
          <span className="step-number">04</span>
          <div>
            <h2>同じ条件で繰り返す</h2>
            <p>
              全6ラウンド、各期の時間は教員が設定します（既定は4分）。1取引は最大30秒、休憩は1分です。時間内に成立しなければ次の取引へ、2回続けて成立しなければ次の期へ進みます。各市場は独立して進行します。
            </p>
            <p>
              取引履歴と配当は自動で記録されます。接続が切れた場合は、同じルームコード・名前・暗証番号で再入室してください。個人の切断では市場の時間は止まりません。
            </p>
          </div>
        </section>
        <Link href="/" className="button primary">
          参加画面へ
        </Link>
      </article>
    </Shell>
  );
}
