import { Link } from "react-router-dom";
import HeaderMenu from "../Menu";

export default function SenseursPassifs() {
    return (
        <div className="pl-2 pr-2">
            <HeaderMenu title='Senseurs Passifs' backLink={true} />
            <main className="pt-4">
                <Link to='/apps'>Back</Link>
            </main>
        </div>
    )
}
