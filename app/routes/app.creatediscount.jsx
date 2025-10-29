import moment from 'moment';
import {
  Card,
  Layout,
  Page,
  TextField,
  Text,
  Icon,
  Button,
  Select,
  DatePicker,
  Popover,
  Box,
  Checkbox,
  List,
  InlineGrid,
  RadioButton,
  Label,
  ResourceList,
  ResourceItem,
  Link,
  InlineStack,
  BlockStack,
  Autocomplete,
  Divider,
  FormLayout,
  ColorPicker,
} from "@shopify/polaris";
import shopify, { authenticate } from "../shopify.server";
// import { json } from "stream/consumers";
import { json, redirect } from "@remix-run/node";
import DB from "../db.server";
import {
  AddDiscountCoupon,
  createPriceRule,
  createCouponBatch,
  formValidation,
  retrieveFormData,
  getCurrentTimeEST,
} from "../helper/helper";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useActionData, useLoaderData, useNavigate, useSubmit } from "@remix-run/react";
import { ClockIcon, SearchIcon, XIcon, CalendarIcon } from "@shopify/polaris-icons";
import { getDiscounts } from "../discount_server";
// import DatePicker from "../components/datepicker";

export const action = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.admin(request);
    const req_data = await request.formData();
    const data = await retrieveFormData(req_data);
    data["shop"] = session.shop;

    console.log('Form Data (26):', (data));


    if ( true) {
      let price_rule = await createPriceRule(session, admin, data);
      console.log("Price Rule: ", price_rule);

      if (price_rule['success'] === true) {
        data["price_rule_id"] = price_rule.data.id.toString();
        let localEntry = await AddDiscountCoupon(data);
        data['batch_id'] = localEntry.id;
        console.log("Local Entry: ", localEntry);

        const batch = await createCouponBatch(session, admin, data);
        if(batch.success === true){
          throw redirect('/app');
        }
      }else{
        return price_rule
      }
    }
    return true;
  } catch (error) {
    console.log("Error in catch action: ", error);
    return error;
  }
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const result = await admin.graphql(
    `
    #graphql
    query Shop {
      shop {
        currencyCode
      }
      app {
        installation {
          launchUrl
          activeSubscriptions {
            id
            name
            createdAt
            returnUrl
            status
            currentPeriodEnd
            trialDays
          }
        }
      }
    }
  `,
    { vaiables: {} }
  );
  const resultJson = await result.json();
  const { launchUrl, activeSubscriptions } = resultJson.data.app.installation;
  const { currencyCode } = resultJson.data.shop;
  let limit = 3;
  let status = false;
  let planid = null;
  if (activeSubscriptions.length > 0) {
    activeSubscriptions.forEach((plan, index) => {
      if (plan.status == "ACTIVE") {
        status = plan.status;
        planid = index;
      }
    });
    console.log("status plan: ", status);
    if (status == "ACTIVE") {
      limit = -1;
    }
  }

  let data = await getDiscounts(session.shop);
  let res = {
    status: status,
    discounts: data,
    currencyCode: currencyCode
  }
  return res;
};


export default function AdditionalPage() {
  const {status, discounts, currencyCode} = useLoaderData();
  const [discountAvailable, setDiscountAvailable]= useState(false);
  const actionResult = useActionData();
  const navigate = useNavigate();
  var dateToday = new Date();
  var currentDate = dateToday.setDate(dateToday.getDate() + 1);
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const formatCurrency = (amount, code) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'symbol'
    }).format(amount);
  };

  const getCurrencySymbol = (code) => {
    return formatCurrency(0, code).replace(/[\d,.]/g, '');
  };

  const [fData, setFData] = useState({
    title: "",
    prefix_code: "",
    code_length: 6,
    quantity: 100,
    discount_type: "percentage",
    discount_value: "",
    customer_selection: "all",
    target_type: "line_item",
    target_selection: "all",
    allocation_method: "across",
    min_requirement_info: "one-time purchase products",
    minimum_quantity_req: "",
    minimum_req: "",
    start_date: new Date(),
    start_time: "",
    end_date_checked: false,
    end_date: new Date(),
    end_time: "",
    allocation_limit: "",
    prerequisite_collection_ids: "",
    prerequisite_collection: "entire_order",
    applied_to: "All",
    entitled_product_ids: "",
    prerequisite_to_entitlement_quantity_ratio: null,
    expires: "",
    button_style_type: "sticker",
    standard_btn_text: "Tap to reveal discount",
    standard_btn_bg_color: "#864CFF",
    standard_btn_border_color: "#864CFF",
    standard_btn_text_color: "#FFFFFF",
    success_btn_text: "Click to apply code",
    success_btn_bg_color: "#18C932",
    success_btn_border_color: "#18C932",
    success_btn_text_color: "#FFFFFF",
  });
  const formRef = useRef();
  const submit = useSubmit();
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  // const [switchAppliesTo, setSwitchAppliesTo] = "all";
  const [errorMessages, setErrorMessages] = useState({});

  useEffect(() => {
    console.log('action data:', actionResult)
    if(actionResult){
      if(actionResult.success === true){
        setLoading(false)
      }
      else{
        setLoading(false)
        // shopify.toast.show('Failed to Create Price Rule');
      }
    }
  }, [actionResult])

  useEffect(() => {
    if (status === false && discounts.length > 2) {
      navigate('/app');
    }else{
      setDiscountAvailable(true);
    }
  }, [status]);

  // DtaePicker Code
  const [visible, setVisible] = useState(false);
  const [{ start_month, start_year }, setDate] = useState(() => {
    const estDate = new Date(fData.start_date.toLocaleString('en-US', { timeZone: 'America/New_York' }));

    return {
      start_month: estDate.getMonth(),
      start_year: estDate.getFullYear(),
    };
  });
  // const formattedValue = fData.start_date.toISOString().split('T')[0];
  const formattedValue = moment(fData.start_date).format('YYYY-MM-DD');
  const datePickerRef = useRef(null);

  function handleInputValueChange() {
    console.log("handleInputValueChange");
  }
  function handleOnClose({ relatedTarget }) {
    setVisible(false);
  }
  function handleMonthChange(start_month, start_year) {
    setDate({ start_month, start_year });
  }
  function handleDateSelection({ end: newSelectedDate }) {
    console.log('new date: ', newSelectedDate)
    // setSelectedDate(newSelectedDate);
    setFData((prevData) => ({
      ...prevData,
      ['start_date']: newSelectedDate,
    }));
    setVisible(false);
  }
  useEffect(() => {
    if (fData.start_date) {
      setDate({
        start_month: fData.start_date.getMonth(),
        start_year: fData.start_date.getFullYear(),
      });
    }
  }, [fData.start_date]);

  useEffect(() => {
    // Update the start_time field when the component mounts
    // setFData((prevData) => ({
    //   ...prevData,
    //   start_time: getCurrentTimeEST(),
    // }));
  }, []);
  /// End date picker

  const [endvisible, setEndVisible] = useState(false);
  const [{ end_month, end_year }, setEndDate] = useState({
    end_month: fData.end_date.getMonth(),
    end_year: fData.end_date.getFullYear(),
  });

  const formattedEndValue = moment(fData.end_date).format('YYYY-MM-DD');
  const datePickerEndRef = useRef(null);

  function handleEndInputValueChange() {
    console.log("handleInputValueChange");
  }
  function handleEndOnClose({ relatedTarget }) {
    setEndVisible(false);
  }
  function handleEndMonthChange(end_month, end_year) {
    setEndDate({ end_month, end_year });
  }
  function handleEndDateSelection({ end: newSelectedDate }) {
    console.log('new date: ', newSelectedDate)
    // setSelectedDate(newSelectedDate);
    setFData((prevData) => ({
      ...prevData,
      ['end_date']: newSelectedDate,
    }));
    setEndVisible(false);
  }
  useEffect(() => {
    if (fData.end_date) {
      setEndDate({
        end_month: fData.end_date.getMonth(),
        end_year: fData.end_date.getFullYear(),
      });
    }
  }, [fData.end_date]);

  ///////////////////



  const discount_options = [
    { label: "Percentage", value: "percentage" },
    { label: "Fixed", value: "fixed_amount" },
  ];
  const optionsTarget_type = [
    { label: "Line Item", value: "line_item" },
    { label: "Shipping Line", value: "shipping_line" },
  ];
  const optionsTarget_selection = [
    { label: "all", value: "all" },
    { label: "entitled", value: "entitled" },
  ];
  const buttonStyleOptions = [
    { label: "Sticker (Corner Cut)", value: "sticker" },
    { label: "Rounded Pill", value: "rounded" },
    { label: "Square Edges", value: "square" },
    { label: "Outline", value: "outline" },
  ];
  // const [customerSelection, setCustomerSelection] = useState('all_customers');
  // const optionsAllocation_method = [
  //   {label: 'across', value: 'across'},
  //   {label: 'each', value: 'each'},
  // ];

  const [discountTypeSelected, SetDiscountTypeSelected] =
    useState("percentage");
  const [targetTypeSelected, SetTargetTypeSelected] = useState("line_item");
  const [targetSelectionSelected, SetTargetSelectionSelected] = useState("all");
  const [customerSelectionSelected, SetCustomerSelectionSelected] =
    useState("all");
  const [buttonStyleSelected, SetButtonStyleSelected] = useState("sticker");

  // Color picker states
  const [showStandardBgPicker, setShowStandardBgPicker] = useState(false);
  const [showStandardBorderPicker, setShowStandardBorderPicker] = useState(false);
  const [showStandardTextPicker, setShowStandardTextPicker] = useState(false);
  const [showSuccessBgPicker, setShowSuccessBgPicker] = useState(false);
  const [showSuccessBorderPicker, setShowSuccessBorderPicker] = useState(false);
  const [showSuccessTextPicker, setShowSuccessTextPicker] = useState(false);

  const handleDiscountTypeChange = useCallback(
    (value) => SetDiscountTypeSelected(value),
    []
  );
  const handleTargetTypeChange = useCallback((value) => {
    SetTargetTypeSelected(value);

    if (value === "line_item") {
      setFData((prevData) => ({
        ...prevData,
        allocation_method: "across",
      }));
    } else if (value === "shipping_line") {
      setFData((prevData) => ({
        ...prevData,
        allocation_method: "each",
      }));
    }
  }, []);
  const handleTargetSelectionChange = useCallback(
    (value) => SetTargetSelectionSelected(value),
    []
  );
  const handleButtonStyleChange = useCallback((value) => {
    SetButtonStyleSelected(value);

    // Set default colors based on button style
    let newColors = {};
    if (value === 'sticker') {
      // Sticker keeps original purple/green colors
      newColors = {
        standard_btn_bg_color: "#864CFF",
        standard_btn_border_color: "#864CFF",
        standard_btn_text_color: "#FFFFFF",
        success_btn_bg_color: "#18C932",
        success_btn_border_color: "#18C932",
        success_btn_text_color: "#FFFFFF",
      };
    } else if (value === 'outline') {
      // Outline has transparent bg, black text, green success
      newColors = {
        standard_btn_bg_color: "#FFFFFF",
        standard_btn_border_color: "#000000",
        standard_btn_text_color: "#000000",
        success_btn_bg_color: "#FFFFFF",
        success_btn_border_color: "#18C932",
        success_btn_text_color: "#000000",
      };
    } else {
      // Rounded and Square have black/white standard, green success
      newColors = {
        standard_btn_bg_color: "#000000",
        standard_btn_border_color: "#000000",
        standard_btn_text_color: "#FFFFFF",
        success_btn_bg_color: "#18C932",
        success_btn_border_color: "#18C932",
        success_btn_text_color: "#FFFFFF",
      };
    }

    setFData((prevData) => ({
      ...prevData,
      button_style_type: value,
      ...newColors,
    }));
  }, []);

  // Helper function to convert hex to HSB for ColorPicker
  const hexToHsb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { hue: 0, saturation: 0, brightness: 0 };

    const r = parseInt(result[1], 16) / 255;
    const g = parseInt(result[2], 16) / 255;
    const b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let hue = 0;
    let saturation = max === 0 ? 0 : delta / max;
    let brightness = max;

    if (delta !== 0) {
      if (max === r) {
        hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
      } else if (max === g) {
        hue = ((b - r) / delta + 2) / 6;
      } else {
        hue = ((r - g) / delta + 4) / 6;
      }
    }

    return {
      hue: hue * 360,
      saturation: saturation,
      brightness: brightness,
    };
  };

  // Helper function to convert HSB to hex
  const hsbToHex = (hsb) => {
    const h = hsb.hue / 360;
    const s = hsb.saturation;
    const v = hsb.brightness;

    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
      default: r = 0; g = 0; b = 0;
    }

    const toHex = (x) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  };

  // Generate preview discount code based on prefix and length (memoized to prevent regeneration on every render)
  const previewCode = useMemo(() => {
    const prefix = fData.prefix_code || "";
    const length = parseInt(fData.code_length) || 6;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let randomPart = "";

    for (let i = 0; i < length; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return prefix + randomPart;
  }, [fData.prefix_code, fData.code_length]);

  const generateProduct = async (event) => {
    event.preventDefault();
    setLoading(true);
    let fDataLoad = new FormData(formRef.current);
    let params = await retrieveFormData(fDataLoad);
    console.log("Params: ", params);
    const validationResult = await formValidation(params);
    console.log("validation result in generate Products: ", validationResult);
    if (validationResult.success === false) {
      setLoading(false);
      console.log("validation Message:", validationResult);
      setErrorMessages(validationResult.message);
      console.log("Error Message: ", errorMessages);
    } else {
      setErrorMessages({});
      submit(fDataLoad, {
        replace: true,
        action: "/app/creatediscount",
        method: "POST",
      });
    }
  };

  const handleInputChange = async (name, value) => {
    /* console.log('name: ', name);
    console.log('Value: ', value); */
    const validationResult = await formValidation({ name: value });
    if (validationResult.success === false) {
      setErrorMessages(validationResult.message);
    } else {
      setErrorMessages((preError) => ({
        ...preError,
        [name]: "",
      }));
    }
    // if (name === "prerequisite_collection") {
    //   setProducts([]);
    //   setCollections([]);
    // }
    // if (name === "prerequisite_collection") {
    //   setProducts([]);
    //   setCollections([]);
    // }
    setFData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };
  /*
  const radioChangeHandler = useCallback(
    ( newValue ) => setCustomerSelection(newValue),
    [],
  ); */

  async function selectProduct() {
    console.log("clicked");
    setCollections([]);
    const getProducts = await window.shopify.resourcePicker({
      type: "product",
      selectionIds: products,
      products: products,
      multiple: true,
      action: "select",
    });
    if (getProducts) {
      const pattern = /\d+/;
      const productIds = await getProducts.map((product) => {
        let id = product.id;
        const match = id.match(pattern);
        return match[0];
      });

      console.log(productIds);
      setProducts(getProducts);
      setCollections([]);
      setFData((prevData) => ({
        ...prevData,
        entitled_product_ids: productIds,
        allocation_method: "each",
        target_selection: "entitled",
        target_type: "line_item",
      }));
    }
  }
  async function selectCollection() {
    const getCollection = await window.shopify.resourcePicker({
      type: "collection",
      selectionIds: collections,
      collections: collections,
      multiple: true,
      action: "select", // customized action verb, either 'select' or 'add',
    });
    let collectionIds = [];
    if (getCollection) {
      const pattern = /\d+/;
      collectionIds = await getCollection.map((collection) => {
        let id = collection.id;
        const match = id.match(pattern);
        return match[0];
      });
    }
    setCollections(getCollection);
    setProducts([]);
    setFData((prevData) => ({
      ...prevData,
      prerequisite_collection_ids: collectionIds,
      allocation_method: "across",
      target_selection: "entitled",
      target_type: "line_item",
      // prerequisite_to_entitlement_quantity_ratio: {
      //   prerequisite_quantity: 2,
      //   entitled_quantity: 1
      // },
    }));
    console.log("Collection Items:", collections, "FData Items: ", fData);
  }

  useEffect(() => {
    console.log(
      "use effect console Collection Items:",
      collections,
      "FData Items: ",
      fData
    );
  }, [fData]);

  const removeCollection = (collectionId) => {
    var updatedCollection = [];
    updatedCollection = collections.filter(
      (collection) => collection.id !== collectionId
    );
    setCollections(updatedCollection);
  };

  const removeProducts = (productId) => {
    var updatedProducts = [];
    updatedProducts = products.filter((product) => product.id !== productId);
    setProducts(updatedProducts);
  };

  const hanleAppliesTo = (value) => {
    console.log(value);
    setProducts([]);
    setCollections([]);
    setSwitchAppliesTo(value);
  };

  const handleCacel = () => {
    setCancelLoading(true);
    navigate('/app');
  }

  const [selectedOptions2, setSelectedOptions2] = useState([]);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [inputValue2, setInputValue2] = useState("");
  const [options2, setOptions2] = useState([]);
  const [options, setOptions] = useState([]);

  const generateTimeSlots = () => {
    const currentTime = new Date();
    const timeSlots = [];
    let iterations = 0;

    // currentTime.setMinutes(Math.ceil(currentTime.getMinutes() / 30) * 30);
    // currentTime.setMinutes(Math.ceil(currentTime.getMinutes() / 30) * 30);
    const formattedTime2 = currentTime.toLocaleTimeString([], {
      timeZone: 'America/New_York',
      hour: "2-digit",
      minute: "2-digit",
    });
    timeSlots.push({ value: formattedTime2, label: formattedTime2 });
    currentTime.setMinutes(Math.ceil(currentTime.getMinutes() / 30) * 30);

    while (iterations < 48) {
      const formattedTime = currentTime.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York', // Set the timezone to EST
        // hour12: false, // Use 24-hour format
        hour: "2-digit",
        minute: "2-digit",
      });
      timeSlots.push({ value: formattedTime, label: formattedTime });

      currentTime.setMinutes(currentTime.getMinutes() + 30);
      iterations++;
    }

    return timeSlots;
  };

  useEffect(() => {
    const generatedTimeSlots = generateTimeSlots();
    setOptions2(generatedTimeSlots);
    setOptions(generatedTimeSlots)
  }, []); // Run this effect only once when the component mounts

  const updateText = useCallback(
    (value) => {
    //   handleInputChange('start_time', value);
        // setFData((prevData) => ({
        // ...prevData,
        // start_time: value,
        // }));

      if (value === "") {
        setOptions(generateTimeSlots());
        return;
      }

      const filterRegex = new RegExp(value, "i");
      const resultOptions = options.filter((option) =>
        option.label.match(filterRegex)
      );
      setOptions(resultOptions);
    },
    [options, fData]
  );

  const updateText2 = useCallback(
    (value) => {
    //   handleInputChange('end_time', value);
    setFData((prevData) => ({
        ...prevData,
        end_time: value,
        }));

      if (value === "") {
        setOptions2(generateTimeSlots());
        return;
      }

      const filterRegex = new RegExp(value, "i");
      const resultOptions = options2.filter((option) =>
        option.label.match(filterRegex)
      );
      setOptions2(resultOptions);
    },
    [options2, fData]
  );

  function convertTo24HourFormat(time12h) {
  const [time, period] = time12h.split(' ');
  const [hours, minutes] = time.split(':');

  let hours24 = parseInt(hours, 10);

  if (period === 'PM' && hours24 < 12) {
    hours24 += 12;
  } else if (period === 'AM' && hours24 === 12) {
    hours24 = 0;
  }

  const formattedTime = `${hours24.toString().padStart(2, '0')}:${minutes}`;

  return formattedTime;
}

  const updateSelection = useCallback(
    (selected) => {
      const selectedValue = selected.map((selectedItem) => {
        const matchedOption = options.find((option) =>
          option.value.match(selectedItem)
        );
        return matchedOption && matchedOption.label;
      });

      setSelectedOptions(selected);
      setInputValue(selectedValue[0] || "");

      console.log(selectedValue[0])
      handleInputChange('start_time', convertTo24HourFormat(selectedValue[0]));
    },
    [options]
  );

  const updateSelection2 = useCallback(
    (selected) => {
      const selectedValue = selected.map((selectedItem) => {
        const matchedOption = options2.find((option) =>
          option.value.match(selectedItem)
        );
        return matchedOption && matchedOption.label;
      });

      setSelectedOptions2(selected);
      setInputValue2(selectedValue[0] || "");

      console.log(selectedValue[0])

      handleInputChange('end_time', convertTo24HourFormat(selectedValue[0]));
    },
    [options2]
  );

  const textField = (
    <Autocomplete.TextField
      onChange={updateText}
      label="Time Slots (EST)"
      value={inputValue}
      prefix={<Icon source={ClockIcon} tone="base" />}
      placeholder="8:00 AM"
      autoComplete="off"
    />
  );

  const textField2 = (
    <Autocomplete.TextField
      onChange={updateText2}
      label="Time Slots (EST)"
      value={inputValue2}
      prefix={<Icon source={ClockIcon} tone="base" />}
      placeholder="8:00 AM"
      autoComplete="off"
    />
  );
  return (
    <Page
      title="Create discount code set"
      backAction={{ content: "", url: "/app" }}
      primaryAction={<Button variant="primary" onClick={generateProduct} loading={loading}>Save</Button>}
      secondaryActions={
        <InlineStack gap="200">
          {/* <Button variant="plain" onClick={() => {window.open("mailto:info@linveba.com", "_blank");}}>Contact support</Button> */}
          <Button onClick={handleCacel} loading={cancelLoading}>Cancel</Button>
        </InlineStack>
      }
    >
      <Layout>
      <form ref={formRef} method="post">
        <Layout.Section>
          <InlineGrid gap="400" columns={{xs: 1, sm: 1, md: ['twoThirds', 'oneThird'], lg: ['twoThirds', 'oneThird'], xl: ['twoThirds', 'oneThird']}}>
            <div>
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Discount set</Text>
                    <TextField
                      label="Title"
                      helpText="The name of the discount the codes will be grouped under."
                      name="title"
                      type="text"
                      error={errorMessages.title && errorMessages.title}
                      value={fData.title}
                      onChange={(value) => handleInputChange("title", value)}
                      labelHidden={false}
                      autoComplete="off"
                      placeholder="Example: 2024 VIP Discount 10% OFF"
                    />
                    <InlineGrid columns={3} gap="200">
                      <TextField
                        label="Discount codes prefix"
                        name="prefix_code"
                        type="text"
                        error={errorMessages.prefix_code && errorMessages.prefix_code}
                        value={fData.prefix_code}
                        onChange={(value) => handleInputChange("prefix_code", value)}
                        labelHidden={false}
                        autoComplete="off"
                        placeholder="Example: VIP-"
                      />
                      <TextField
                        label="Code length"
                        name="code_length"
                        type="text"
                        error={errorMessages.code_length && errorMessages.code_length}
                        value={fData.code_length}
                        onChange={(value) => handleInputChange("code_length", value)}
                        labelHidden={false}
                        autoComplete="off"
                      />
                      <TextField
                        label="Quantity"
                        name="quantity"
                        type="text"
                        error={errorMessages.quantity && errorMessages.quantity}
                        value={fData.quantity}
                        onChange={(value) => handleInputChange("quantity", value)}
                        labelHidden={false}
                        autoComplete="off"
                      />
                    </InlineGrid>
                  </BlockStack>
                </Card>
              </Layout.Section>
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Discount value</Text>

                    <InlineGrid columns={2} gap="200">
                      <Select
                        label="Discount type"
                        name="discount_type"
                        options={discount_options}
                        onChange={handleDiscountTypeChange}
                        value={discountTypeSelected}
                      />

                      <TextField
                        label="Discount value"
                        name="discount_value"
                        type="text"
                        prefix={discountTypeSelected == 'percentage' ? '%' : getCurrencySymbol(currencyCode)}
                        error={
                          errorMessages.discount_value && errorMessages.discount_value
                        }
                        value={fData.discount_value}
                        onChange={(value) => handleInputChange("discount_value", value)}
                        autoComplete="off"
                        placeholder="-10"
                        helpText="Must be negative"
                      />
                    </InlineGrid>

                    <Divider />

                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">Applies to</Text>
                      <BlockStack gap="100">
                        <RadioButton
                          label="All products"
                          checked={fData.prerequisite_collection === "entire_order"}
                          id="entire_order"
                          name="prerequisite_collection"
                          value="entire_order"
                          onChange={(status, value) =>
                            handleInputChange("prerequisite_collection", value)
                          }
                          onClick={() => hanleAppliesTo("all")}
                        />
                        <RadioButton
                          label="Specific collections"
                          checked={fData.prerequisite_collection === "collections"}
                          id="collections"
                          name="prerequisite_collection"
                          value="collections"
                          onChange={(status, value) =>
                            handleInputChange("prerequisite_collection", value)
                          }
                          onClick={() => hanleAppliesTo("collection")}
                        />
                        <RadioButton
                          label="Specific products"
                          id="products"
                          name="prerequisite_collection"
                          value="products"
                          checked={fData.prerequisite_collection === "products"}
                          onChange={(status, value) =>
                            handleInputChange("prerequisite_collection", value)
                          }
                          onClick={() => hanleAppliesTo("product")}
                        />
                      </BlockStack>

                      {fData.prerequisite_collection === "collections" && (
                        <TextField
                          label="Prerequisite Collection"
                          name="prerequisite_collection_ids"
                          type="text"
                          error={
                            errorMessages.prerequisite_collection_ids &&
                            errorMessages.prerequisite_collection_ids
                          }
                          value={fData.prerequisite_collection_ids}
                          labelHidden={true}
                          prefix={<Icon source={SearchIcon} />}
                          placeholder="Select Collection"
                          autoComplete="off"
                          connectedRight={
                            <Button onClick={selectCollection}>Browse</Button>
                          }
                        />
                      )}

                      {fData.prerequisite_collection === "products" && (
                        <TextField
                          label="Prerequisite Products"
                          name="entitled_product_ids"
                          value={fData.entitled_product_ids}
                          type="text"
                          error={
                            errorMessages.entitled_product_ids &&
                            errorMessages.entitled_product_ids
                          }
                          labelHidden={true}
                          prefix={<Icon source={SearchIcon} />}
                          placeholder="Select Products"
                          autoComplete="off"
                          connectedRight={
                            <Button onClick={selectProduct}>Browse</Button>
                          }
                        />
                      )}

                      {collections && collections.length > 0 && (
                        <ResourceList
                          resourceName={{
                            singular: "collection",
                            plural: "collections",
                          }}
                          items={collections}
                          renderItem={(item) => {
                            const { id, title } = item;
                            return (
                              <ResourceItem
                                id={id}
                                verticalAlignment="center"
                                accessibilityLabel={`View details for ${title}`}
                              >
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text variant="bodyMd" fontWeight="semibold" as="h3">
                                    {title}
                                  </Text>
                                  <Link onClick={() => removeCollection(id)}>
                                    <Icon source={XIcon} />
                                  </Link>
                                </InlineStack>
                              </ResourceItem>
                            );
                          }}
                        />
                      )}

                      {products && products.length > 0 && (
                        <ResourceList
                          resourceName={{
                            singular: "product",
                            plural: "products",
                          }}
                          items={products}
                          renderItem={(item) => {
                            const { id, title } = item;
                            return (
                              <ResourceItem
                                id={id}
                                verticalAlignment="center"
                                accessibilityLabel={`View details for ${title}`}
                              >
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text variant="bodyMd" fontWeight="semibold" as="h3">
                                    {title}
                                  </Text>
                                  <Link onClick={() => removeProducts(id)}>
                                    <Icon source={XIcon} />
                                  </Link>
                                </InlineStack>
                              </ResourceItem>
                            );
                          }}
                        />
                      )}
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Minimum purchase requirements</Text>
                    <BlockStack gap="300">
                      <RadioButton
                        label="No minimum requirements"
                        checked={fData.min_requirement_info === "one-time purchase products"}
                        id="one-time purchase products"
                        name="min_requirement_info"
                        value="one-time purchase products"
                        onChange={(status, value) =>
                          handleInputChange("min_requirement_info", value)
                        }
                      />

                      <BlockStack gap="200">
                        <RadioButton
                          label={`Minimum purchase amount (${getCurrencySymbol(currencyCode)})`}
                          checked={fData.min_requirement_info === "Minimum Purchase Of"}
                          id="Minimum Purchase Of"
                          name="min_requirement_info"
                          value="Minimum Purchase Of"
                          onChange={(status, value) =>
                            handleInputChange("min_requirement_info", value)
                          }
                        />
                        {fData.min_requirement_info === "Minimum Purchase Of" && (
                          <Box paddingInlineStart="800">
                            <TextField
                              label="Minimum amount"
                              labelHidden
                              name="minimum_req"
                              type="text"
                              prefix={getCurrencySymbol(currencyCode)}
                              error={errorMessages.minimum_req && errorMessages.minimum_req}
                              value={fData.minimum_req}
                              onChange={(value) => handleInputChange("minimum_req", value)}
                              autoComplete="off"
                              placeholder="50"
                            />
                          </Box>
                        )}
                      </BlockStack>

                      <BlockStack gap="200">
                        <RadioButton
                          label="Minimum quantity of items"
                          id="Minimum Quantity Of"
                          name="min_requirement_info"
                          value="Minimum Quantity Of"
                          checked={fData.min_requirement_info === "Minimum Quantity Of"}
                          onChange={(status, value) =>
                            handleInputChange("min_requirement_info", value)
                          }
                        />
                        {fData.min_requirement_info === "Minimum Quantity Of" && (
                          <Box paddingInlineStart="800">
                            <TextField
                              label="Minimum quantity"
                              labelHidden
                              name="minimum_quantity_req"
                              type="text"
                              error={errorMessages.minimum_quantity_req && errorMessages.minimum_quantity_req}
                              value={fData.minimum_quantity_req}
                              onChange={(value) => handleInputChange("minimum_quantity_req", value)}
                              autoComplete="off"
                              placeholder="2"
                            />
                          </Box>
                        )}
                      </BlockStack>
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Active dates</Text>
                    <InlineGrid columns={{xs: 1, sm: 1, md: 2, lg: 2, xl: 2}} gap="200">
                      <BlockStack gap="400">
                          <Popover
                            active={visible}
                            autofocusTarget="none"
                            preferredAlignment="left"
                            fullWidth
                            preferInputActivator={false}
                            preferredPosition="below"
                            preventCloseOnChildOverlayClick
                            onClose={handleOnClose}
                            activator={
                              <TextField
                                role="combobox"
                                label={"Start date"}
                                name="start_date"
                                prefix={<Icon source={CalendarIcon} />}
                                value={formattedValue}
                                onFocus={() => setVisible(true)}
                                onChange={handleInputValueChange}
                                autoComplete="off"
                              />
                            }
                          >
                            <Card ref={datePickerRef}>
                              <DatePicker
                                month={start_month}
                                year={start_year}
                                selected={fData.start_date}
                                onMonthChange={handleMonthChange}
                                onChange={handleDateSelection}
                              />
                            </Card>
                          </Popover>
                      </BlockStack>
                      {/* <TextField
                        label="Start time (EST)"
                        name="start_time"
                        type="time"
                        error={errorMessages.start_time && errorMessages.start_time}
                        value={fData.start_time}
                        onChange={(value) => handleInputChange("start_time", value)}
                        labelHidden={false}
                        autoComplete="off"
                      /> */}
                      <div>
                        <Autocomplete
                          options={options}
                          selected={selectedOptions}
                          onSelect={updateSelection}
                          textField={textField}
                        />
                      </div>
                    </InlineGrid>
                    <div>
                      <Checkbox
                        label="Set end date"
                        name="end_date_checked"
                        checked={fData.end_date_checked}
                        onChange={(value) => handleInputChange("end_date_checked", value)}
                      />
                      {
                        fData.end_date_checked &&
                        <InlineGrid columns={{xs: 1, sm: 1, md: 2, lg: 2, xl: 2}} gap="200">
                          <BlockStack gap="400">
                              <Popover
                                active={endvisible}
                                autofocusTarget="none"
                                preferredAlignment="left"
                                fullWidth
                                preferInputActivator={false}
                                preferredPosition="below"
                                preventCloseOnChildOverlayClick
                                onClose={handleEndOnClose}
                                activator={
                                  <TextField
                                    role="combobox"
                                    label={"End date"}
                                    prefix={<Icon source={CalendarIcon} />}
                                    name="end_date"
                                    value={formattedEndValue}
                                    onFocus={() => setEndVisible(true)}
                                    onChange={handleEndInputValueChange}
                                    autoComplete="off"
                                  />
                                }
                              >
                                <Card ref={datePickerEndRef}>
                                  <DatePicker
                                    month={end_month}
                                    year={end_year}
                                    selected={fData.end_date}
                                    onMonthChange={handleEndMonthChange}
                                    onChange={handleEndDateSelection}
                                  />
                                </Card>
                              </Popover>
                          </BlockStack>
                          {/* <TextField
                            label="End time (EET)"
                            name="end_time"
                            type="time"
                            error={errorMessages.end_time && errorMessages.end_time}
                            value={fData.end_time}
                            onChange={(value) => handleInputChange("end_time", value)}
                            labelHidden={false}
                            autoComplete="off"
                          /> */}

                          <Autocomplete
                            options={options2}
                            selected={selectedOptions2}
                            onSelect={updateSelection2}
                            textField={textField2}
                          />
                        </InlineGrid>
                      }
                    </div>
                  </BlockStack>
                </Card>
              </Layout.Section>

            </div>
            <div className="card-min-height">
              <Layout.Section>
              <BlockStack gap="300">
                <Card>
                 
                    <Text variant="headingMd" as="h2">Summary</Text>
                    <List type="bullet" gap="extraTight">
                      <List.Item>Limit of 1 use, one per customer</List.Item>
                      <List.Item>Percentage off order</List.Item>
                      {/* <List.Item>Applies to 'Homepage' collection</List.Item> */}
                      <List.Item>Unique codes</List.Item>
                    </List>
                  
                </Card>
                {/* Help */}
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  Need help?
                </Text>
                <Text as="p" tone="subdued">
                  Email us at{" "}
                  <a
                    href="mailto:info@clickxapp.com"
                    style={{ color: "var(--p-color-text-brand)" }}
                  >
                    info@clickxapp.com
                  </a>
                </Text>
              </BlockStack>
            </Card>
                </BlockStack>
                
              </Layout.Section>
            </div>
          </InlineGrid>
        </Layout.Section>
        <Layout.Section>
          <InlineGrid gap="400" columns={{xs: 1, sm: 1, md: 2, lg: 2, xl: 2}}>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Standard button style</Text>
                <Select
                  label="Button style"
                  name="button_style_type"
                  options={buttonStyleOptions}
                  onChange={handleButtonStyleChange}
                  value={buttonStyleSelected}
                  helpText="Choose the visual style for your discount button"
                />
                <TextField
                  label="Button text"
                  name="standard_btn_text"
                  placeholder="Tap to reveal discount"
                  type="text"
                  error={errorMessages.standard_btn_text && errorMessages.standard_btn_text}
                  value={fData.standard_btn_text}
                  onChange={(value) => handleInputChange("standard_btn_text", value)}
                  autoComplete="off"
                />
                <InlineGrid columns={3} gap="200">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">Background color</Text>
                    <Popover
                      active={showStandardBgPicker}
                      activator={
                        <Button
                          onClick={() => setShowStandardBgPicker(!showStandardBgPicker)}
                          fullWidth
                        >
                          <InlineStack gap="200" align="center">
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '3px',
                              backgroundColor: fData.standard_btn_bg_color,
                              border: '1px solid #c9cccf'
                            }} />
                            <Text as="span">{fData.standard_btn_bg_color}</Text>
                          </InlineStack>
                        </Button>
                      }
                      onClose={() => setShowStandardBgPicker(false)}
                    >
                      <Box padding="400">
                        <ColorPicker
                          color={hexToHsb(fData.standard_btn_bg_color)}
                          onChange={(color) => {
                            const hex = hsbToHex(color);
                            handleInputChange("standard_btn_bg_color", hex);
                          }}
                        />
                      </Box>
                    </Popover>
                    <input type="hidden" name="standard_btn_bg_color" value={fData.standard_btn_bg_color} />
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">Border color</Text>
                    <Popover
                      active={showStandardBorderPicker}
                      activator={
                        <Button
                          onClick={() => setShowStandardBorderPicker(!showStandardBorderPicker)}
                          fullWidth
                        >
                          <InlineStack gap="200" align="center">
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '3px',
                              backgroundColor: fData.standard_btn_border_color,
                              border: '1px solid #c9cccf'
                            }} />
                            <Text as="span">{fData.standard_btn_border_color}</Text>
                          </InlineStack>
                        </Button>
                      }
                      onClose={() => setShowStandardBorderPicker(false)}
                    >
                      <Box padding="400">
                        <ColorPicker
                          color={hexToHsb(fData.standard_btn_border_color)}
                          onChange={(color) => {
                            const hex = hsbToHex(color);
                            handleInputChange("standard_btn_border_color", hex);
                          }}
                        />
                      </Box>
                    </Popover>
                    <input type="hidden" name="standard_btn_border_color" value={fData.standard_btn_border_color} />
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">Text color</Text>
                    <Popover
                      active={showStandardTextPicker}
                      activator={
                        <Button
                          onClick={() => setShowStandardTextPicker(!showStandardTextPicker)}
                          fullWidth
                        >
                          <InlineStack gap="200" align="center">
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '3px',
                              backgroundColor: fData.standard_btn_text_color,
                              border: '1px solid #c9cccf'
                            }} />
                            <Text as="span">{fData.standard_btn_text_color}</Text>
                          </InlineStack>
                        </Button>
                      }
                      onClose={() => setShowStandardTextPicker(false)}
                    >
                      <Box padding="400">
                        <ColorPicker
                          color={hexToHsb(fData.standard_btn_text_color)}
                          onChange={(color) => {
                            const hex = hsbToHex(color);
                            handleInputChange("standard_btn_text_color", hex);
                          }}
                        />
                      </Box>
                    </Popover>
                    <input type="hidden" name="standard_btn_text_color" value={fData.standard_btn_text_color} />
                  </BlockStack>
                </InlineGrid>
                <Divider />
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Preview</Text>
                  <div className="button-container">
                    <button
                      style={{
                        width:'100%',
                        maxWidth:'288px',
                        backgroundColor: fData.button_style_type === 'outline' ? 'transparent' : fData.standard_btn_bg_color,
                        borderColor: fData.standard_btn_border_color,
                        color: fData.standard_btn_text_color
                      }}
                      className={`btn btn-primary ${
                        fData.button_style_type === 'sticker'
                          ? 'btn-sticker btn-sticker-45 btn-sticker-corner-border-inherit'
                          : fData.button_style_type === 'rounded'
                          ? 'btn-rounded'
                          : fData.button_style_type === 'square'
                          ? 'btn-square'
                          : 'btn-outline'
                      }`}
                      id="discountMainBtn"
                      disabled
                    >
                      <span className="button-text">{fData.standard_btn_text}</span>
                    </button>
                  </div>
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Success button style</Text>
                <TextField
                  label="Button text"
                  name="success_btn_text"
                  placeholder="Click to apply code"
                  type="text"
                  error={errorMessages.success_btn_text && errorMessages.success_btn_text}
                  value={fData.success_btn_text}
                  onChange={(value) => handleInputChange("success_btn_text", value)}
                  autoComplete="off"
                />
                <InlineGrid columns={3} gap="200">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">Background color</Text>
                    <Popover
                      active={showSuccessBgPicker}
                      activator={
                        <Button
                          onClick={() => setShowSuccessBgPicker(!showSuccessBgPicker)}
                          fullWidth
                        >
                          <InlineStack gap="200" align="center">
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '3px',
                              backgroundColor: fData.success_btn_bg_color,
                              border: '1px solid #c9cccf'
                            }} />
                            <Text as="span">{fData.success_btn_bg_color}</Text>
                          </InlineStack>
                        </Button>
                      }
                      onClose={() => setShowSuccessBgPicker(false)}
                    >
                      <Box padding="400">
                        <ColorPicker
                          color={hexToHsb(fData.success_btn_bg_color)}
                          onChange={(color) => {
                            const hex = hsbToHex(color);
                            handleInputChange("success_btn_bg_color", hex);
                          }}
                        />
                      </Box>
                    </Popover>
                    <input type="hidden" name="success_btn_bg_color" value={fData.success_btn_bg_color} />
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">Border color</Text>
                    <Popover
                      active={showSuccessBorderPicker}
                      activator={
                        <Button
                          onClick={() => setShowSuccessBorderPicker(!showSuccessBorderPicker)}
                          fullWidth
                        >
                          <InlineStack gap="200" align="center">
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '3px',
                              backgroundColor: fData.success_btn_border_color,
                              border: '1px solid #c9cccf'
                            }} />
                            <Text as="span">{fData.success_btn_border_color}</Text>
                          </InlineStack>
                        </Button>
                      }
                      onClose={() => setShowSuccessBorderPicker(false)}
                    >
                      <Box padding="400">
                        <ColorPicker
                          color={hexToHsb(fData.success_btn_border_color)}
                          onChange={(color) => {
                            const hex = hsbToHex(color);
                            handleInputChange("success_btn_border_color", hex);
                          }}
                        />
                      </Box>
                    </Popover>
                    <input type="hidden" name="success_btn_border_color" value={fData.success_btn_border_color} />
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodyMd">Text color</Text>
                    <Popover
                      active={showSuccessTextPicker}
                      activator={
                        <Button
                          onClick={() => setShowSuccessTextPicker(!showSuccessTextPicker)}
                          fullWidth
                        >
                          <InlineStack gap="200" align="center">
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '3px',
                              backgroundColor: fData.success_btn_text_color,
                              border: '1px solid #c9cccf'
                            }} />
                            <Text as="span">{fData.success_btn_text_color}</Text>
                          </InlineStack>
                        </Button>
                      }
                      onClose={() => setShowSuccessTextPicker(false)}
                    >
                      <Box padding="400">
                        <ColorPicker
                          color={hexToHsb(fData.success_btn_text_color)}
                          onChange={(color) => {
                            const hex = hsbToHex(color);
                            handleInputChange("success_btn_text_color", hex);
                          }}
                        />
                      </Box>
                    </Popover>
                    <input type="hidden" name="success_btn_text_color" value={fData.success_btn_text_color} />
                  </BlockStack>
                </InlineGrid>
                <Divider />
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Preview</Text>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <button
                      className={`discount-code ${
                        fData.button_style_type === 'rounded'
                          ? 'btn-rounded'
                          : fData.button_style_type === 'square'
                          ? 'btn-square'
                          : fData.button_style_type === 'outline'
                          ? 'btn-outline'
                          : ''
                      }`}
                      id="discountCode"
                      disabled
                      style={{
                        backgroundColor: fData.button_style_type === 'outline' ? 'transparent' : fData.success_btn_bg_color,
                        borderColor: fData.success_btn_border_color,
                        color: fData.success_btn_text_color,
                        width:'100%',
                        maxWidth:'288px'
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{previewCode}</p>
                    </button>
                    <Text
                      as="p"
                      variant="bodySm"
                      tone="subdued"
                      alignment="center"
                      style={{
                        fontSize: '12px',
                        color: fData.success_btn_bg_color,
                        width: '100%',
                        maxWidth: '288px',
                        textAlign: 'center',
                        marginTop: '8px'
                      }}
                    >
                      {fData.success_btn_text || "Click to apply code"}
                    </Text>
                  </div>
                  <input type="hidden" name="start_time" value={fData.start_time} />
                  <input type="hidden" name="end_time" value={fData.end_time} />
                  <input type="hidden" name="target_type" value={fData.target_type} />
                  <input type="hidden" name="target_selection" value={fData.target_selection} />
                  <input type="hidden" name="allocation_method" value={fData.allocation_method} />
                  <input type="hidden" name="minimum_quantity_req" value={fData.minimum_quantity_req} />
                  <input type="hidden" name="minimum_req" value={fData.minimum_req} />
                  <input type="hidden" name="prerequisite_to_entitlement_quantity_ratio" value={JSON.stringify(fData.prerequisite_to_entitlement_quantity_ratio)} />
                </BlockStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
        </form>
      </Layout>
      <p className="bottom-gap"></p>
    </Page>
  );
}
