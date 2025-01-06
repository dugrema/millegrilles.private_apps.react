import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function DefaultPageRedirect() {

    let navigate = useNavigate();

    useEffect(()=>{
        // Default to browse user files (top level)
        navigate('/apps/collections2/b');
    }, [navigate]);

    return <p>Redirecting</p>;
}

export default DefaultPageRedirect;
