import { Link } from "react-router-dom";

export default function Main() {

    return (
        <>
            <nav><Link to='/apps/senseurspassifs/devices'>All devices</Link></nav>
            <nav><Link to='/apps'>Back</Link></nav>
        </>
    )

}
