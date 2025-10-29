import {
  Card,
  Layout,
  Page,
  TextField,
  Text,
  List,
  InlineGrid,
  BlockStack,
  Button,
  Icon,
  Select,
  Popover,
  Box,
  ColorPicker,
  Divider,
  InlineStack,
  Collapsible,
  Badge,
  Banner
} from "@shopify/polaris";
import {
  ClipboardIcon,
  ExternalIcon,
  ViewIcon
} from '@shopify/polaris-icons';
import { formValidation } from "../helper/helper";
import { useEffect, useState, useCallback, useMemo } from "react";
import { activateDiscount, deactivateDiscount, deleteDiscount, getSingleDiscount, updateDiscount } from "../discount_server";
import { useActionData, useLoaderData, useNavigate, useSubmit } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export const action = async({request}) => {
  const { session, admin } = await authenticate.admin(request);
  const requestBody = await request.formData();
  const id  = requestBody.get("id");
  const actionType = requestBody.get("action");

  console.log('Action: '+ actionType + ', ID:' + id)
  if(actionType === 'Update Discount'){
    const updateData = {};

    requestBody.forEach((value, key) => {
      if(key !== 'action' && key !== 'id'){
        updateData[key] = value;
        console.log("Fdata: ",key, value);
      }
    });

    const data = await updateDiscount(id, updateData);

    if(data.success === true){
      return data;
    }
    else{
      return false;
    }
  }
  else if(actionType === 'Deactive Discount' && id){
    console.log("Discount ID: ", id);
    const currentDate = new Date();
    currentDate.setHours(currentDate.getHours() - 6);
    const price_rule = new admin.rest.resources.PriceRule({session: session});
    price_rule.id = id;
    price_rule.ends_at = new Date();
    console.log("expire Date: ", price_rule.ends_at);
    await price_rule.save({
      update: true,
    });
    // await admin.rest.resources.PriceRule.delete({
    //   session: session,
    //   id: id,
    // });
    const result = await deactivateDiscount(id);
    // console.log('Result of Diactivate: ', result);
    return result;
  }
  else if(actionType === 'Activate Discount' && id){
    console.log("Discount ID: ", id);
    const expiry_date = requestBody.get("expiry_date");

    const result = await activateDiscount(id);

    const price_rule = new admin.rest.resources.PriceRule({session: session});
    price_rule.id = id;
    price_rule.ends_at = new Date(expiry_date);
    console.log("expire Date: ", price_rule.ends_at);
    await price_rule.save({
      update: true,
    });
    // await admin.rest.resources.PriceRule.delete({
    //   session: session,
    //   id: id,
    // });
    // console.log('Result of Diactivate: ', result);
    return result;
  }
  else{
    return false;
  }
}
export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const result = await admin.graphql(
    `
    #graphql
    query Shop {
      shop {
        currencyCode
        url
        myshopifyDomain
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
  const { activeSubscriptions } = resultJson.data.app.installation;
  const { currencyCode, myshopifyDomain } = resultJson.data.shop;
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
  let data = await getSingleDiscount(params.id);
  let response = {
    data: data,
    limit: limit,
    plan: activeSubscriptions.length > 0 ? activeSubscriptions : [],
    planid: planid,
    currencyCode: currencyCode,
    shopDomain: myshopifyDomain
  };
  return response;
};

export default function UpdateDiscountPage() {
  const { data: discount, limit, planid, currencyCode, shopDomain } = useLoaderData();
  const actionResult = useActionData();
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copyDiscountId, setCopyDiscountID] = useState(discount.coupon_id);
  const [errorMessages, setErrorMessages] = useState({});
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const submit = useSubmit();

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

  const handleCopy = useCallback(() =>
    {
      let discountIdValue = copyDiscountId;
      navigator.clipboard.writeText(discountIdValue);
      shopify.toast.show("Copied to clipboard");
    },[]);

  useEffect(() => {
    if (actionResult != undefined || actionResult != null) {
      console.log('Actions Result: ', actionResult);
      if (actionResult.success === true && actionResult.action === 'Deactive Discount') {
        shopify.toast.show("Discount Deactivated Successfully...");
        setIsLoading(false);
        // nav('/app');
        // setDiscountId(true);
      }
      if (actionResult.success === true && actionResult.action === 'Activate Discount') {
        shopify.toast.show("Discount Activated Successfully...");
        setIsDeleting(false);
        // nav('/app');
        // setDiscountId(true);
      }
      else if (actionResult.success === true && actionResult.action === 'Update Discount') {
        shopify.toast.show("Discount Updated Successfully...");
        // setUpdateDiscount(false);
        setIsLoading(false);
      }
      else{
        setIsDeleting(false);
      }
    }
  }, [actionResult]);

  const [fData, setFData] = useState({
    title: "asdf",
    prefix_code: "ABC_",
    code_length: 6,
    quantity: 10,
    discount_type: "",
    discount_value: "-10",
    customer_selection: "all",
    target_type: "",
    target_selection: "",
    allocation_method: "across",
    min_purchase_req: "no_requirement",
    minimum_quantity_req: 0,
    minimum_amount_req: 1,
    start_date: new Date(),
    start_time: "",
    end_date_checked: false,
    end_date: new Date(),
    end_time: "",
    allocation_limit: "",
    prerequisite_collection_ids: [],
    prerequisite_collection: discount.prerequisite_collection,
    entitled_product_ids: [],
    prerequisite_to_entitlement_quantity_ratio: [],
    expires: "",
    button_style_type: discount.button_style_type || "sticker",
    standard_btn_text: discount.standard_btn_text,
    standard_btn_bg_color: discount.standard_btn_bg_color,
    standard_btn_border_color: discount.standard_btn_border_color || discount.standard_btn_bg_color,
    standard_btn_text_color: discount.standard_btn_text_color,
    success_btn_text: discount.success_btn_text,
    success_btn_bg_color: discount.success_btn_bg_color ,
    success_btn_border_color: discount.success_btn_border_color || discount.success_btn_bg_color,
    success_btn_text_color: discount.success_btn_text_color,
  });

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
    if (name === "prerequisite_collection") {
      // setProducts([]);
      // setCollections([]);
    }
    setFData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleDeactive = (event) => {
    event.preventDefault();
    setIsDeleting(true);
    const formData = new FormData();
    formData.append('action', 'Deactive Discount');
    formData.append('id', discount.coupon_id);
    submit(formData, { replace: true, method: "POST" });
  }

  const handleActive = (event) => {
    event.preventDefault();
    setIsDeleting(true);

    let startDate = new Date(discount.starts_at).toISOString();
    let expiryDate = new Date(discount.expires).toISOString();
    const currentDate = new Date().toISOString();
    let isActive = false;
    if(expiryDate != '1970-01-01T00:00:00.000Z'){
      isActive = currentDate >= startDate && currentDate <= expiryDate;
    }else{
      isActive = true;
    }
    if(isActive){
      const formData = new FormData();
      formData.append('action', 'Activate Discount');
      formData.append('id', discount.coupon_id);
      formData.append('expiry_date', discount.expires);
      submit(formData, { replace: true, method: "POST" });
      setIsDeleting(false);
      setIsLoading(false);
    }else{
      shopify.toast.show("Discount Already Expired and unable to Activate again...");
      setIsDeleting(false);
      setIsLoading(false);
    }
  }

  const handleSaveBtn = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    const formData = new FormData();
    formData.append('action', 'Update Discount');
    formData.append('button_style_type', fData.button_style_type);
    formData.append('standard_btn_text', fData.standard_btn_text);
    formData.append('standard_btn_bg_color', fData.standard_btn_bg_color);
    formData.append('standard_btn_border_color', fData.standard_btn_border_color);
    formData.append('standard_btn_text_color', fData.standard_btn_text_color);
    formData.append('success_btn_text', fData.success_btn_text);
    formData.append('success_btn_bg_color', fData.success_btn_bg_color);
    formData.append('success_btn_border_color', fData.success_btn_border_color);
    formData.append('success_btn_text_color', fData.success_btn_text_color);
    formData.append('id', discount.coupon_id);

    submit(formData, { replace: true, method: "POST" });
    // const resp = await updateDiscount(discount.id, fData)
    // console.log(discount.id, fData, resp);
    // shopify.toast.show("Discount Updated Successfully...");
  }

  // Button style options
  const buttonStyleOptions = [
    { label: "Sticker (Corner Cut)", value: "sticker" },
    { label: "Rounded Pill", value: "rounded" },
    { label: "Square Edges", value: "square" },
    { label: "Outline", value: "outline" },
  ];

  const [buttonStyleSelected, SetButtonStyleSelected] = useState(fData.button_style_type);

  // Color picker states
  const [showStandardBgPicker, setShowStandardBgPicker] = useState(false);
  const [showStandardBorderPicker, setShowStandardBorderPicker] = useState(false);
  const [showStandardTextPicker, setShowStandardTextPicker] = useState(false);
  const [showSuccessBgPicker, setShowSuccessBgPicker] = useState(false);
  const [showSuccessBorderPicker, setShowSuccessBorderPicker] = useState(false);
  const [showSuccessTextPicker, setShowSuccessTextPicker] = useState(false);

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
    const prefix = discount.prefix_code || "";
    const length = parseInt(discount.code_length) || 6;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let randomPart = "";

    for (let i = 0; i < length; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return prefix + randomPart;
  }, [discount.prefix_code, discount.code_length]);

  // Determine discount status
  const discountStatus = useMemo(() => {
    const now = new Date();
    const startDate = new Date(discount.starts_at);
    const expiryDate = discount.expires && discount.expires !== '1970-01-01T00:00:00.000Z'
      ? new Date(discount.expires)
      : null;

    if (!discount.isActive) {
      return { label: 'Inactive', tone: 'critical' };
    }

    if (now < startDate) {
      return { label: 'Scheduled', tone: 'info' };
    }

    if (expiryDate && now > expiryDate) {
      return { label: 'Expired', tone: 'warning' };
    }

    return { label: 'Active', tone: 'success' };
  }, [discount.isActive, discount.starts_at, discount.expires]);

  // Format last modified date
  const lastModified = useMemo(() => {
    if (discount.updated_at) {
      const date = new Date(discount.updated_at);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return null;
  }, [discount.updated_at]);
  return (
    <Page
      title={discount.title}
      backAction={{ content: "", url: "/app" }}
      titleMetadata={<Badge tone={discountStatus.tone}>{discountStatus.label}</Badge>}
      subtitle={lastModified ? `Last modified: ${lastModified}` : undefined}
      primaryAction={<Button variant="primary" onClick={handleSaveBtn} loading={isLoading}>Save</Button>}
      secondaryActions={[
        {
          content: discount.isActive ? "Deactivate" : "Activate",
          tone: discount.isActive ? "critical" : "success",
          onAction: discount.isActive ? handleDeactive : handleActive,
          loading: isDeleting
        },
        {
          content: "View in Shopify Admin",
          icon: ExternalIcon,
          onAction: () => {
            window.open(`https://${shopDomain}/admin/discounts/${discount.coupon_id}`, '_blank');
          }
        }
      ]}
    >
      <Layout>
        <Layout.Section>
          <InlineGrid
            gap="300"
            columns={{
              xs: 1,
              sm: 1,
              md: ["twoThirds", "oneThird"],
              lg: ["twoThirds", "oneThird"],
              xl: ["twoThirds", "oneThird"],
            }}
          >
            <div>
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">
                      Discount ID
                    </Text>
                    <TextField
                      label="Discount ID"
                      labelHidden
                      type="text"
                      autoComplete="off"
                      value={copyDiscountId}
                      disabled={true}
                      connectedRight={<Button onClick={handleCopy}>
                        <Icon
                        source={ClipboardIcon}
                        tone="base"
                      />
                      </Button>}
                    />
                    <Divider />
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">How to add this discount to your store</Text>
                      <List type="number" gap="loose">
                        <List.Item>
                          <Text as="p" variant="bodyMd">
                            Click the copy button above to copy the Discount ID
                          </Text>
                        </List.Item>
                        <List.Item>
                          <Text as="p" variant="bodyMd">
                            Go to your Shopify theme editor (Online Store → Themes → Customize)
                          </Text>
                        </List.Item>
                        <List.Item>
                          <Text as="p" variant="bodyMd">
                            Add or select the ClickX app block on your product page
                          </Text>
                        </List.Item>
                        <List.Item>
                          <Text as="p" variant="bodyMd">
                            Paste the Discount ID in the app block settings
                          </Text>
                        </List.Item>
                      </List>
                      <Button
                        icon={ViewIcon}
                        onClick={() => {
                          window.open(`https://${shopDomain}/admin/themes/current/editor`, '_blank');
                        }}
                        fullWidth
                      >
                        Customize Theme
                      </Button>
                    </BlockStack>
                    <Divider />
                    <Button
                      onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                      ariaExpanded={isDetailsOpen}
                      ariaControls="discount-details"
                      fullWidth
                      textAlign="left"
                      disclosure={isDetailsOpen ? "up" : "down"}
                    >
                      Discount details
                    </Button>
                    <Collapsible
                      open={isDetailsOpen}
                      id="discount-details"
                      transition={{duration: '200ms', timingFunction: 'ease-in-out'}}
                    >
                      <BlockStack gap="400">
                        <TextField
                          label="Title"
                          helpText="The name of the discount the codes will be grouped under."
                          name="title"
                          type="text"
                          placeholder="title"
                          labelHidden={false}
                          autoComplete="off"
                          value={discount.title}
                          disabled
                        />
                        <InlineGrid columns={3} gap="200">
                          <TextField
                            label="Prefix"
                            name="prefix_code"
                            type="text"
                            placeholder="ABC-"
                            value={discount.prefix_code}
                            labelHidden={false}
                            autoComplete="off"
                            disabled
                          />
                          <TextField
                            label="Code length"
                            name="code_length"
                            type="text"
                            placeholder="6"
                            value={discount.code_length}
                            labelHidden={false}
                            autoComplete="off"
                            disabled
                          />
                          <TextField
                            label="Quantity"
                            name="quantity"
                            type="text"
                            placeholder="1"
                            labelHidden={false}
                            value={discount.quantity}
                            autoComplete="off"
                            disabled
                          />
                        </InlineGrid>
                      </BlockStack>
                    </Collapsible>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </div>
            <div className="card-min-height">
              <Layout.Section>
                <Card>
                  <div style={{ marginTop: "14px" }}>
                    <BlockStack gap="300">
                      <Text variant="headingMd" as="h2">
                        Summary
                      </Text>
                      <List type="bullet" gap="extraTight">
                        <List.Item>Limit of 1 use, one per customer</List.Item>
                        <List.Item>
                          <Text variant="bodySm" as="span">
                            {`
                              ${discount.discount_type == "percentage" 
                                ? `${Math.abs(discount.discount_value)}% off` 
                                : `${formatCurrency(Math.abs(discount.discount_value), currencyCode)} off`} ${discount.min_purchase_req === "no_requirement" ? "" : " " + discount.min_purchase_req}
                              ${discount.applied_to != "All" ? "Selected Collection/Products" : ""}
                            `}
                          </Text>
                        </List.Item>
                        <List.Item>Unique codes</List.Item>
                      </List>
                      <Text variant="headingMd" as="h2">
                        Performance
                      </Text>
                      <List type="bullet" gap="extraTight">
                        <List.Item>{discount.used}: Used</List.Item>
                        <List.Item>
                          <Text variant="bodySm" as="span">
                            {formatCurrency(discount.revenue || 0, currencyCode)} Revenue
                          </Text>
                        </List.Item>
                      </List>
                    </BlockStack>
                  </div>
                </Card>
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
                </BlockStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>
      </Layout>
      <div style={{ width: "100%", height: "100px" }}></div>
    </Page>
  );
}
