import { useMemo, useEffect, useState } from "react";
import { proxy } from "comlink";

import { certificates } from 'millegrilles.cryptography';
import { ConnectionCallbackParameters } from "millegrilles.reactdeps.typescript";

import useWorkers, { AppWorkers, initWorkers, InitWorkersResult } from "./workers";
import useConnectionStore from "../connectionStore";
import { userStoreIdb, CommonTypes } from 'millegrilles.reactdeps.typescript';

/**
 * Initializes the Web Workers and a few other elements to connect to the back-end.
 */
function InitializeWorkers() {
    let workersReady = useConnectionStore((state) => state.workersReady);
    let workersRetry = useConnectionStore((state) => state.workersRetry);
    let incrementWorkersRetry = useConnectionStore(
        (state) => state.incrementWorkersRetry
    );
    let setWorkersRetryReady = useConnectionStore(
        (state) => state.setWorkersRetryReady
    );
    let setWorkersReady = useConnectionStore((state) => state.setWorkersReady);
    let setFiche = useConnectionStore((state) => state.setFiche);
    let setUsername = useConnectionStore((state) => state.setUsername);
    let setUserSessionActive = useConnectionStore((state) => state.setUserSessionActive);
    // let setMustManuallyAuthenticate = useConnectionStore((state) => state.setMustManuallyAuthenticate);
    let setConnectionAuthenticated = useConnectionStore((state) => state.setConnectionAuthenticated);

    let setConnectionReady = useConnectionStore(
        (state) => state.setConnectionReady
    );

    let connectionCallback = useMemo(() => {
        return proxy((params: ConnectionCallbackParameters) => {
            // console.debug("Connection callback : %O", params);
            let connected = !!params.connected;
            if(!connected) {
                setUserSessionActive(false);
                setConnectionReady(false);
                setConnectionAuthenticated(false);
            }
            if(params.connected !== undefined) {
                setConnectionReady(params.connected);
            }
            if(params.authenticated !== undefined) {
                setConnectionAuthenticated(!!params.authenticated);
            }
        });
    }, [setConnectionReady, setConnectionAuthenticated, setUserSessionActive]);

    // Load the workers with a useMemo that returns a Promise. Allows throwing the promise
    // and catching it with the <React.Suspense> element in index.tsx.
    let workerLoadingPromise = useMemo(() => {
        // Avoid loop, only load workers once.
        if (!workersRetry.retry || workersReady || !connectionCallback) return;
        incrementWorkersRetry();

        // Stop loading the page when too many retries.
        if (workersRetry.count > 4) {
            let error = new Error("Too many retries");
            // @ts-ignore
            error.code = 1;
            // @ts-ignore
            error.retryCount = workersRetry.count;
            throw error;
        }

        return fetch('/auth/verifier_usager')
            .then(async (verifUser: Response) => {
                let userStatus = verifUser.status;
                let username = verifUser.headers.get('x-user-name');
                // let userId = verifUser.headers.get('x-user-id');
                setUserSessionActive(userStatus === 200);
                if(username) setUsername(username);

                let result = await initWorkers(connectionCallback) as InitWorkersResult;
                // Success.
                setFiche(result.idmg, result.ca, result.chiffrage);
                // Set the worker state to ready, allows the remainder of the application to load.
                setWorkersReady(true);

                if(username) {
                    await authenticateConnectionWorker(result.workers, username, true)
                } else {
                    // throw new Error("Session not active");
                    console.warn("Session not active, redirect to login page");
                    let currentUrl = window.location.pathname;
                    window.location.assign(`/millegrilles?returnTo=${currentUrl}`);
                }
            })
            .catch((err: any) => {
                console.error(
                    "Error initializing web workers. Retrying in 5 seconds. %O",
                    err
                );
                let promise = new Promise((resolve: any) => {
                    setTimeout(() => {
                        setWorkersRetryReady();
                        resolve();
                    }, 5_000);
                });
                return promise;
            });
        }, [
            workersReady,
            workersRetry,
            setFiche,
            incrementWorkersRetry,
            setWorkersRetryReady,
            setWorkersReady,
            setUserSessionActive,
            setUsername,
            connectionCallback,
    ]);

    if (workerLoadingPromise && !workersReady) throw workerLoadingPromise;

    return <MaintainConnection />;
}

export default InitializeWorkers;

function MaintainConnection() {
    let workers = useWorkers();
    let workersReady = useConnectionStore((state) => state.workersReady);
    let connectionReady = useConnectionStore((state) => state.connectionReady);
    let connectionAuthenticated = useConnectionStore((state) => state.connectionAuthenticated);
    let username = useConnectionStore((state) => state.username);

    let [reconnection, setReconnection] = useState(false);

    useEffect(() => {
        if (!workers) return;
  
        // Start the connection.
        workers.connection.connect()
        .catch((err) => {
            console.error("Connection error", err);
        });

    }, [workers]);

    useEffect(()=>{
        if(!workersReady || !workers) return;
        // Start regular maintenance
        let maintenanceInterval = setInterval(()=>{
            if(workers) maintain(workers);
        }, 30_000);
        return () => clearInterval(maintenanceInterval);
    }, [workersReady, workers]);

    // Reconnect authentication handler
    useEffect(()=>{
        if(!reconnection) return;  // Avoids double connection on page load

        //console.debug('InitializeWorkers connectionReady: %s, connectionAuthenticated: %s', connectionReady, connectionAuthenticated);
        if(connectionReady && !connectionAuthenticated) {
            if(workers && username) {
                // Ensure this is a reconnection
                authenticateConnectionWorker(workers, username, true, false)
                    .catch(err=>console.error("Error authenticating ", err))
            } else {
                console.error("Session not active");
            }
        }
    }, [workers, connectionReady, connectionAuthenticated, username, reconnection])

    // Toggle to avoid double authentication on page load
    useEffect(()=>{
        if(connectionReady && connectionAuthenticated) {
            setReconnection(true);
        }
    }, [connectionReady, connectionAuthenticated, setReconnection])

    return <></>
}

/** Regular maintenance on the connection. */
async function maintain(workers: AppWorkers) {
    try {
        await workers.connection.maintain();
    } catch(err) {
        console.error("Error maintaining connection ", err);
    }
}

/**
 * Connect using socket-io.
 * @param workers 
 * @param username 
 * @param userSessionActive 
 * @returns 
 */
async function authenticateConnectionWorker(workers: AppWorkers, username: string, 
    userSessionActive: boolean, reconnect?: boolean): Promise<CommonTypes.PerformLoginResult> 
{
    if(!workers) return {};  // Waiting for a connection
    if(reconnect !== false) reconnect = true;

    if(!userSessionActive || !username) {
        // User session is not active. We need to manually authenticate.
        // setMustManuallyAuthenticate(true);
        return { mustManuallyAuthenticate: true };
    }

    // There is a user session (cookie) and a username in the server session. 
    // Check if we have a valid signing key/certificate for this user.
    let userDbInfo = await userStoreIdb.getUser(username)
    if(!userDbInfo) {
        // No local information (certificate). 
        return { mustManuallyAuthenticate: true };
    }

    let certificateInfo = userDbInfo.certificate;
    if(!certificateInfo) {
        // No certificate. The user must authenticate manually.
        return { mustManuallyAuthenticate: true };
    }

    let wrapper = new certificates.CertificateWrapper(certificateInfo.certificate);

    // Check if the certificate is expired
    let expiration = wrapper.certificate.notAfter;
    let now = new Date();
    if(now > expiration) {
        throw new Error("User certificate is expired");
    }

    // Initialize the message factory with the user's information.
    let { privateKey, certificate } = certificateInfo;
    await workers.connection.prepareMessageFactory(privateKey, certificate);

    // Authenticate the connection
    if(!await workers.connection.authenticate(reconnect)) throw new Error('Authentication failed (api mapping)');

    return { authenticated: true };
}
