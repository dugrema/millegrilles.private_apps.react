import {
  lazy,
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  Fragment,
  Dispatch,
} from "react";
import { useParams, Link } from "react-router-dom";
import Datetime from "react-datetime";

import useWorkers from "../workers/workers";
import useSenseursPassifsStore, {
  DeviceReadings,
  DeviceReadingValue,
} from "./senseursPassifsStore";
import {
  SenseursPassifsStatistiquesItem,
  SenseursPassifsStatistiquesResponse,
  StatisticsRequestType,
} from "../types/connection.types";
import { Formatters } from "millegrilles.reactdeps.typescript";
import { SelectTimezone } from "./EditDevice";

const ChartTemperatures = lazy(() => import("./charts/ChartTemperatures"));
const ChartHumidite = lazy(() => import("./charts/ChartHumidite"));
const ChartPression = lazy(() => import("./charts/ChartPression"));

const DATETIME_DATE_FORMAT = "YYYY-MM-DD";
const DATETIME_TIME_FORMAT = "HH:mm:ss";

export default function ComponentDetail() {
  let params = useParams();
  let devices = useSenseursPassifsStore((state) => state.devices);

  let [deviceId, componentId] = useMemo(() => {
    if (!params.deviceId || !params.componentId) return [null, null];
    let componentId = decodeURIComponent(params.componentId);
    let deviceId = params.deviceId;
    return [deviceId, componentId];
  }, [params]);

  let [device, component] = useMemo(() => {
    if (!deviceId || !devices || !componentId) return [null, null];
    let device = devices[deviceId];
    if (!device || !device.senseurs) return [null, null]; // Unknown device
    let component = device.senseurs[componentId];
    return [device, component];
  }, [deviceId, componentId, devices]);

  if (!deviceId || !componentId) throw new Error("Invalid parameters");
  if (!device || !component) return <p>Component loading...</p>;

  return (
    <>
      <nav>
        <Link
          to="/apps/senseurspassifs/devices"
          className="btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500"
        >
          List
        </Link>
        <Link
          to={`/apps/senseurspassifs/device/${deviceId}`}
          className="btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500"
        >
          Device
        </Link>
      </nav>

      <h1>Statistics {deviceId}</h1>

      <p>Component {componentId}</p>

      <StatistiquesSenseur
        device={device}
        componentId={componentId}
        component={component}
      />
    </>
  );
}

function StatistiquesSenseur(props: {
  device: DeviceReadings;
  componentId: string;
  component: DeviceReadingValue;
}) {
  let { device, component, componentId } = props;
  let uuid_appareil = device.uuid_appareil;
  let typeValeur = component.type;

  let workers = useWorkers();

  let [timezone, setTimezone] = useState("America/Montreal");
  let setTimezoneHandler = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => setTimezone(e.currentTarget.value),
    [setTimezone],
  );

  let [grouping, setGrouping] = useState("");
  let [minDate, setMinDate] = useState(null as Date | null);
  let [maxDate, setMaxDate] = useState(null as Date | null);

  let [data, setData] = useState(
    null as SenseursPassifsStatistiquesResponse | null,
  );

  let groupingHandler = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => setGrouping(e.currentTarget.value),
    [setGrouping],
  );

  const afficherStatistiques = useMemo(() => {
    const decimals = getUnite(typeValeur)[0];
    return decimals !== null;
  }, [typeValeur]);

  useEffect(() => {
    if (!workers || !uuid_appareil || !componentId) return;

    let requete = {
      senseur_id: componentId,
      uuid_appareil,
      timezone,
    } as StatisticsRequestType;
    if (grouping && minDate) {
      requete = {
        ...requete,
        custom_grouping: grouping,
        custom_intervalle_min: Math.round(minDate.getTime() / 1000),
      };
      if (maxDate) {
        requete.custom_intervalle_max = Math.round(maxDate.getTime() / 1000);
      }
    }

    workers.connection
      .getComponentStatistics(requete)
      .then((reponse) => {
        setData(reponse);
      })
      .catch((err) => console.error("Error loading statistics ", err));
  }, [
    workers,
    uuid_appareil,
    componentId,
    setData,
    timezone,
    grouping,
    minDate,
    maxDate,
  ]);

  if (!device || !componentId || !afficherStatistiques) return <></>;

  return (
    <div>
      <h2>Statistiques</h2>

      <div className="mb-3">
        <div>Timezone</div>
        <div>
          <SelectTimezone value={timezone} onChange={setTimezoneHandler} />
        </div>
      </div>

      <div className="grid grid-cols-12">
        <div className="col-span-2">Type rapport</div>
        <div className="col-span-10">
          <select
            value={grouping}
            onChange={groupingHandler}
            className="bg-slate-300 text-black"
          >
            <option value="">Tables en cannes</option>
            <option value="heures">Heures</option>
            <option value="jours">Jours</option>
          </select>
        </div>
      </div>

      <StatistiquesTableCustom
        data={data?.custom}
        valueType={typeValeur}
        grouping={grouping}
        setMinDate={setMinDate}
        setMaxDate={setMaxDate}
      />

      <StatistiquesTable72h data={data?.periode72h} valueType={typeValeur} />

      <StatistiquesTable31j data={data?.periode31j} valueType={typeValeur} />
    </div>
  );
}

function typeChart(typeValeur: string) {
  let TypeChart = null;
  switch (typeValeur) {
    case "temperature":
      TypeChart = ChartTemperatures;
      break;
    case "humidite":
      TypeChart = ChartHumidite;
      break;
    case "pression":
      TypeChart = ChartPression;
      break;
    case "pression_tendance":
      TypeChart = ChartPression;
      break;
    default:
      TypeChart = NoChart;
  }
  return TypeChart;
}

function NoChart() {
  return <></>;
}

function FormatterValeur(props: {
  value: any;
  valueType: string;
  hideType?: boolean;
}) {
  const { value, valueType, hideType } = props;
  if (value === undefined || value === "" || isNaN(value)) return <></>;

  if (valueType === "switch") {
    if (value === 1.0) return <span>ON</span>;
    if (value === 0.0) return <span>OFF</span>;
    const valeurPct = Math.floor(value * 100);
    return <span>{valeurPct}%</span>;
  }

  let [decimals, unite] = getUnite(valueType);
  if (hideType) unite = <></>;

  if (value !== null && decimals !== null) {
    return (
      <span>
        {value.toFixed(decimals)} {unite}
      </span>
    );
  } else {
    return <span>{`${value + unite}`}</span>;
  }
}

function getUnite(typeValeur: string) {
  let decimals = null,
    unite = <></>;
  switch (typeValeur) {
    case "temperature":
      decimals = 1;
      unite = <span>&deg;C</span>;
      break;
    case "humidite":
      decimals = 1;
      unite = <span>%</span>;
      break;
    case "pression":
      decimals = 0;
      unite = <span> hPa</span>;
      break;
    case "pression_tendance":
      decimals = 0;
      unite = <span> Pa</span>;
      break;
    default:
  }
  return [decimals, unite];
}

function StatistiquesTable72h(props: {
  data?: Array<SenseursPassifsStatistiquesItem>;
  valueType: string;
}) {
  const { data, valueType } = props;

  const TypeChart = useMemo(() => typeChart(valueType), [valueType]);

  if (!data) return <></>;
  return (
    <div className="pt-10">
      <h3 className="font-bold text-lg">Table statistiques 3 jours</h3>
      <div className="bg-slate-700 bg-opacity-30">
        <TypeChart className="chart" value={data} unite="heures" />
      </div>
      <div className="grid grid-cols-12 pt-4">
        <div className="col-span-3">Date</div>
        <div className="col-span-1">Heure</div>
        <div className="col-span-1 text-right">Moyenne</div>
        <div className="col-span-1 text-right">Maximum</div>
        <div className="col-span-1 text-right">Minimum</div>
      </div>
      <HoursList data={data} valueType={valueType} />
    </div>
  );
}

function StatistiquesTable31j(props: {
  data?: Array<SenseursPassifsStatistiquesItem>;
  valueType: string;
}) {
  const { data, valueType } = props;

  const TypeChart = useMemo(() => typeChart(valueType), [valueType]);

  if (!data) return <></>;

  return (
    <div className="pt-10">
      <h3 className="font-bold text-lg">Table statistiques 31 jours</h3>
      <div className="bg-slate-700 bg-opacity-30">
        <TypeChart className="chart" value={data} unite="jours" />
      </div>
      <DaysList data={data} valueType={valueType} />
    </div>
  );
}

function HoursList(props: {
  data: Array<SenseursPassifsStatistiquesItem>;
  valueType: string;
}) {
  let { data, valueType } = props;

  let unite = useMemo(() => {
    const unite = getUnite(valueType)[1];
    return unite;
  }, [valueType]);

  if (!data) return <></>;

  let afficherMax = valueType !== "switch";
  let afficherMin = valueType !== "switch";

  let jour = null as number | null;

  let elems = data.map((item) => {
    let jourItem = new Date(item.heure * 1000).getDay() as number | null;
    if (jourItem === jour) {
      jourItem = null;
    } else {
      jour = jourItem;
    }

    return (
      <Fragment key={"" + item.heure}>
        <div className="col-span-2">
          {jourItem ? (
            <Formatters.FormatterDate format="YYYY/MM/DD" value={item.heure} />
          ) : (
            ""
          )}
        </div>
        <div className="col-span-1">
          <Formatters.FormatterDate format="HH:mm:ss" value={item.heure} />
        </div>
        <div className="col-span-1 text-right">
          <FormatterValeur
            value={item.avg}
            valueType={valueType}
            hideType={true}
          />
        </div>
        <div className="col-span-1 text-right">
          {afficherMax ? (
            <FormatterValeur
              value={item.max}
              valueType={valueType}
              hideType={true}
            />
          ) : (
            ""
          )}
        </div>
        <div className="col-span-1 text-right">
          {afficherMin ? (
            <FormatterValeur
              value={item.min}
              valueType={valueType}
              hideType={true}
            />
          ) : (
            ""
          )}
        </div>
        <div className="col-span-1 pl-3">{unite}</div>
        <div className="col-span-4"></div>
      </Fragment>
    );
  });

  return (
    <>
      <div className="grid grid-cols-12 pt-4">
        <div className="col-span-2">Jour</div>
        <div className="col-span-1">Heure</div>
        <div className="col-span-1 text-right">Moyenne</div>
        <div className="col-span-1 text-right">Maximum</div>
        <div className="col-span-1 text-right">Minimum</div>
      </div>
      <div className="grid grid-cols-12">{elems}</div>
    </>
  );
}

function DaysList(props: {
  data: Array<SenseursPassifsStatistiquesItem>;
  valueType: string;
}) {
  const { data, valueType } = props;

  const unite = useMemo(() => {
    const unite = getUnite(valueType)[1];
    return unite;
  }, [valueType]);

  if (!data) return <></>;

  const afficherMax = valueType !== "switch";
  const afficherMin = valueType !== "switch";

  let elems = data.map((item, idx) => (
    <Fragment key={"" + item.heure}>
      <div className="col-span-2">
        <Formatters.FormatterDate value={item.heure} format="YYYY/MM/DD" />
      </div>
      <div className="col-span-1 text-right">
        <FormatterValeur
          value={item.avg}
          valueType={valueType}
          hideType={true}
        />
      </div>
      <div className="col-span-1 text-right">
        {afficherMax ? (
          <FormatterValeur
            value={item.max}
            valueType={valueType}
            hideType={true}
          />
        ) : (
          ""
        )}
      </div>
      <div className="col-span-1 text-right">
        {afficherMin ? (
          <FormatterValeur
            value={item.min}
            valueType={valueType}
            hideType={true}
          />
        ) : (
          ""
        )}
      </div>
      <div className="col-span-1 pl-2">{unite}</div>
      <div className="col-span-6"></div>
    </Fragment>
  ));

  return (
    <>
      <div className="grid grid-cols-12 pt-4">
        <div className="col-span-2">Jour</div>
        <div className="col-span-1 text-right">Moyenne</div>
        <div className="col-span-1 text-right">Maximum</div>
        <div className="col-span-1 text-right">Minimum</div>
      </div>
      <div className="grid grid-cols-12">{elems}</div>
    </>
  );
}

type StatistiquesTableCustomProps = {
  data?: Array<SenseursPassifsStatistiquesItem>;
  valueType: string;
  grouping: string;
  setMinDate: Dispatch<Date | null>;
  setMaxDate: Dispatch<Date | null>;
};

function StatistiquesTableCustom(props: StatistiquesTableCustomProps) {
  const { data, valueType, grouping, setMinDate, setMaxDate } = props;

  const [dateDebut, setDateDebut] = useState(new Date());
  const [dateFin, setDateFin] = useState(new Date());

  useEffect(() => {
    const now = new Date();
    now.setMinutes(0);
    now.setSeconds(0);
    const dateMin = new Date(now.getTime() - 7000 * 86400);
    setDateDebut(dateMin);
    setMinDate(dateMin);
    setDateFin(now);
    setMaxDate(now);
  }, [setDateDebut, setDateFin, setMaxDate, setMinDate]);

  const FormatteurListe = useMemo(() => {
    let Formatteur = null as any;
    switch (grouping) {
      case "jours":
        Formatteur = DaysList;
        break;
      default:
        Formatteur = HoursList;
    }
    return Formatteur;
  }, [grouping]);

  const dateDebutChangeHandler = useCallback(
    (e: any) => setDateDebut(e),
    [setDateDebut],
  );
  const dateFinChangeHandler = useCallback(
    (e: any) => setDateFin(e),
    [setDateFin],
  );
  const dateMinChangeHandler = useCallback(
    (e: any) => {
      setMinDate(e.toDate());
    },
    [setMinDate],
  );
  const dateMaxChangeHandler = useCallback(
    (e: any) => setMaxDate(e.toDate()),
    [setMaxDate],
  );

  const TypeChart = useMemo(() => typeChart(valueType), [valueType]);

  if (!data) return <></>;

  return (
    <div>
      <h3>Statistiques sur mesure</h3>

      {grouping ? (
        <div className="grid grid-cols-4">
          <div className="pb-6">
            <div>Date debut</div>
            <div>
              <Datetime
                value={dateDebut}
                onChange={dateDebutChangeHandler}
                onClose={dateMinChangeHandler}
                dateFormat={DATETIME_DATE_FORMAT}
                timeFormat={DATETIME_TIME_FORMAT}
                className="text-black"
              />
            </div>
          </div>
          <div className="pb-6">
            <div>Date fin</div>
            <div>
              <Datetime
                value={dateFin}
                onChange={dateFinChangeHandler}
                onClose={dateMaxChangeHandler}
                dateFormat={DATETIME_DATE_FORMAT}
                timeFormat={DATETIME_TIME_FORMAT}
                className="text-black"
              />
            </div>
          </div>

          <div className="col-span-12 pl-4 pr-4">
            <TypeChart className="chart" value={data} unite={grouping} />
          </div>
        </div>
      ) : (
        <></>
      )}

      <FormatteurListe data={data} valueType={valueType} />
    </div>
  );
}
