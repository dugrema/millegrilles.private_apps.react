import { useEffect, useMemo } from "react";
import { proxy } from 'comlink';
import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";
import useSenseursPassifsStore, { DeviceReadings } from "./senseursPassifsStore";
import { SubscriptionMessage } from "millegrilles.reactdeps.typescript";

/**
 * Loads all user devices and listens for update events.
 * @returns 
 */
export default function DeviceEvents() {
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let setDevices = useSenseursPassifsStore(state=>state.setDevices);
    let updateDevice = useSenseursPassifsStore(state=>state.updateDevice);
    let updateConfiguration = useSenseursPassifsStore(state=>state.updateConfiguration);

    let deviceEventCb = useMemo(()=>{
        return proxy((event: SubscriptionMessage)=>{
            console.debug("Message ", event)
            let message = event.message as DeviceReadings;
            if(message) {
                updateDevice(message);
                // Update configuration separately. Not all messages contain it.
                if(message.configuration) updateConfiguration(message.uuid_appareil, message.configuration);
            }
        })
    }, [updateDevice, updateConfiguration])

    useEffect(()=>{
        if(!workers || !ready || !deviceEventCb) return;

        // Load user devices
        workers.connection.getUserDevices()
            .then(deviceResponse=>{
                if(deviceResponse.ok) {
                    // Build list into a map of uuid_appareils:device
                    let mappedReadings = deviceResponse.appareils.reduce((acc: {[key: string]: DeviceReadings}, device)=>{
                        acc[device.uuid_appareil] = device;
                        return acc;
                    }, {})
                    setDevices(mappedReadings);
                } else {
                    console.error("Error loading devices: %O", deviceResponse.err)
                }
            })
            .catch(err=>console.error("Error loading device list", err));

        // Subscribe to device events
        console.debug("Subscribe")
        workers.connection.subscribeUserDevices(deviceEventCb)
            .catch(err=>{
                console.debug("Error subscribing to user events", err);
            })

        // Subscription cleanup
        return () => {
            if(workers) {
                workers.connection.unsubscribeUserDevices(deviceEventCb)
                .catch(err=>{
                    console.info("Error unsubscribing to user events", err);
                })
            }
        }
    }, [workers, ready, setDevices, deviceEventCb])

    return <></>;
}
