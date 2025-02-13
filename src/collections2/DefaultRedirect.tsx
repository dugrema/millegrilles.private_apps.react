import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useUserBrowsingStore from "./userBrowsingStore";

function DefaultPageRedirect() {

    let navigate = useNavigate();
    let userId = useUserBrowsingStore(state=>state.userId);

    useEffect(()=>{
        if(!userId) return;

        let previousLocation = localStorage.getItem(`location_${userId}`);
        console.debug("Previous location", previousLocation);
        if(previousLocation) {
            navigate(previousLocation);
            return;    
        }

        // Default to browse user files (top level)
        navigate('/apps/collections2/b');
    }, [navigate, userId]);

    return <p>Redirecting</p>;
}

export default DefaultPageRedirect;
